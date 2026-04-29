"""
Chat service — explicit RAG pipeline

Step-by-step:
  1.  Embed the user query  (OpenAI text-embedding-3-small)
  2.  Similarity search on FAISS  →  top-k chunks + relevance scores
  3.  Build context string from retrieved chunks
  4.  Call GPT-4o with a tailored prompt (role + mode aware)
  5.  Return answer, confidence, citations, and debug metadata
"""

from typing import List, Optional, Tuple
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_core.messages import HumanMessage, SystemMessage

from app.config import settings
from app.models.schemas import ChatResponse
from app.services.document_service import DocumentService


class ChatService:
    """Full RAG pipeline: embed → FAISS search → GPT-4o answer."""

    def __init__(self, document_service: DocumentService):
        self._doc_service = document_service

        # Same embedding model as document_service so vectors are comparable
        self._embeddings = OpenAIEmbeddings(
            model=settings.EMBEDDING_MODEL,
            openai_api_key=settings.OPENAI_API_KEY,
        )

        self._llm = ChatOpenAI(
            model=settings.LLM_MODEL,
            temperature=settings.LLM_TEMPERATURE,
            max_tokens=settings.LLM_MAX_TOKENS,
            openai_api_key=settings.OPENAI_API_KEY,
        )

    # ── Public API ────────────────────────────────────────────────────────────

    async def process_query(
        self,
        query: str,
        mode: str = 'deterministic',
        user_role: str = 'student',
        owner_user_id: Optional[int] = None,
    ) -> ChatResponse:
        """
        Main entry point.
        Returns a ChatResponse with answer, confidence, citations.

        Document isolation: when `owner_user_id` is provided, the FAISS search
        is restricted to chunks tagged with that owner. Other users' documents
        are never visible. Anonymous queries (no `owner_user_id`) return no
        results because every chunk is tied to an owner.
        """

        # ── Guard: must be signed in to access documents ─────────────────────
        if owner_user_id is None:
            return ChatResponse(
                answer=(
                    "Please sign in to chat. Documents are private to each "
                    "account, so the assistant needs to know who you are "
                    "before it can search your uploads."
                ),
                confidence=0,
                citations=[],
                mode=mode,
                retrieved_chunks=0,
            )

        # ── Guard: no documents at all ───────────────────────────────────────
        # Deterministic mode is, by definition, "answer only from your
        # uploaded documents" -- so if there's nothing to retrieve from we
        # have to bail with an upload prompt. Exploratory mode is allowed
        # to fall through to a general-chat path so the user can chat at
        # any time, even before they've uploaded anything.
        vector_store = self._doc_service.get_vector_store()
        if vector_store is None:
            if mode == "deterministic":
                return ChatResponse(
                    answer=(
                        "You haven't uploaded any documents yet, and Deterministic "
                        "mode answers strictly from your uploads. Switch to "
                        "Exploratory mode for general questions, or visit the "
                        "Upload page to add a document first."
                    ),
                    confidence=0,
                    citations=[],
                    mode=mode,
                    retrieved_chunks=0,
                )
            return await self._answer_without_context(query, mode, user_role)

        # ── Step 1: embed the user query ─────────────────────────────────────
        # Async embed so other requests aren't blocked while OpenAI responds.
        # The returned vector is unused (FAISS re-embeds inside similarity_search),
        # but we await it explicitly so the openai call yields the event loop.
        query_embedding: List[float] = await self._embeddings.aembed_query(query)

        # ── Step 2: FAISS similarity search with scores (owner-scoped) ───────
        # The `filter` callable is run against each candidate's metadata; only
        # chunks owned by the current user pass through. We over-fetch a bit
        # because FAISS post-filters and may yield fewer than k otherwise.
        owner_filter = {"owner_user_id": int(owner_user_id)}
        results: List[Tuple] = await vector_store.asimilarity_search_with_score(
            query=query,
            k=settings.TOP_K,
            filter=owner_filter,
            fetch_k=max(settings.TOP_K * 8, 40),
        )

        if not results:
            # Same split as the no-documents case above: deterministic
            # mode tells the user nothing relevant was found, exploratory
            # mode falls through to a general-knowledge answer.
            if mode == "deterministic":
                return ChatResponse(
                    answer=(
                        "I searched your uploaded documents but could not find "
                        "information relevant to your question. Switch to "
                        "Exploratory mode if you'd like a general answer "
                        "instead. (Only documents you uploaded are visible "
                        "to your account.)"
                    ),
                    confidence=40,
                    citations=[],
                    mode=mode,
                    retrieved_chunks=0,
                )
            return await self._answer_without_context(query, mode, user_role)

        docs   = [doc   for doc, _     in results]
        scores = [score for _,   score in results]

        # ── Step 3: build context string ─────────────────────────────────────
        context = self._build_context(docs)

        # ── Step 4: call GPT-4o ───────────────────────────────────────────────
        system_prompt = self._system_prompt(mode, user_role)
        user_message  = (
            f"Context from uploaded documents:\n"
            f"---\n{context}\n---\n\n"
            f"Question: {query}"
        )

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_message),
        ]

        llm_response = await self._llm.ainvoke(messages)
        answer: str  = llm_response.content.strip()

        if mode == 'exploratory':
            answer += (
                "\n\nExploratory note: Think about how this connects to broader "
                "real-world applications and other topics in your studies."
            )

        # ── Step 5: citations + confidence ───────────────────────────────────
        citations  = self._build_citations(docs, scores)
        confidence = self._calculate_confidence(scores, answer)

        return ChatResponse(
            answer=answer,
            confidence=confidence,
            citations=citations,
            mode=mode,
            retrieved_chunks=len(docs),
        )

    # ── Internal helpers ──────────────────────────────────────────────────────

    async def _answer_without_context(
        self,
        query: str,
        mode: str,
        user_role: str,
    ) -> ChatResponse:
        """
        Exploratory-mode fallback when there's nothing to retrieve from --
        either because the user hasn't uploaded any documents yet or because
        none of their uploads matched the query. We let GPT-4o answer from
        general knowledge so the user can keep chatting freely; citations
        come back empty and confidence is fixed (no FAISS signal to lean on).
        """
        system_prompt = self._system_prompt_general(mode, user_role)
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=query),
        ]

        llm_response = await self._llm.ainvoke(messages)
        answer: str = llm_response.content.strip()

        if mode == "exploratory":
            answer += (
                "\n\nExploratory note: Think about how this connects to "
                "broader real-world applications and other topics in your "
                "studies."
            )

        return ChatResponse(
            answer=answer,
            # 70 = "answered from general knowledge"; deliberately lower
            # than a strong RAG match so the UI's confidence chip still
            # reads as "trustworthy but not document-grounded".
            confidence=70,
            citations=[],
            mode=mode,
            retrieved_chunks=0,
        )

    @staticmethod
    def _system_prompt_general(mode: str, role: str) -> str:
        """
        System prompt for the no-context (general-knowledge) path.
        Differs from `_system_prompt` in two ways:
          1. No "answer strictly from the context excerpts" clause --
             there are no excerpts.
          2. Tells GPT to invite the user to upload documents if they
             want a more grounded answer, so the feature is discoverable.
        """
        base = (
            "You are Laboracle, a friendly AI assistant for an educational "
            "platform. The user has not uploaded any documents that match "
            "this question, so answer using your general knowledge. Be "
            "helpful, accurate, and concise. If the question is the kind "
            "of thing that would benefit from grounded sources (their own "
            "notes, syllabus, lecture slides, textbooks), gently mention "
            "that uploading those documents in Deterministic mode would "
            "give a more precise, citation-backed answer."
        )

        role_hint = (
            "You are speaking with a TEACHER. Use precise, professional "
            "language and curriculum-level framing."
            if role == "teacher"
            else
            "You are speaking with a STUDENT. Use clear, friendly language "
            "and explain concepts simply."
        )

        return f"{base}\n\n{role_hint}"

    @staticmethod
    def _build_context(docs: list) -> str:
        """
        Concatenate retrieved chunks into a numbered context block.
        Each chunk is labelled with its source file and chunk number so GPT-4o
        can ground citations naturally.
        """
        parts = []
        for i, doc in enumerate(docs, start=1):
            meta     = doc.metadata
            filename = meta.get('filename', 'Unknown file')
            chunk_n  = meta.get('chunk_index', i - 1) + 1
            page     = meta.get('page', None)
            label    = f"[{i}] {filename} — chunk {chunk_n}"
            if page is not None:
                label += f", page {page}"
            parts.append(f"{label}\n{doc.page_content}")
        return "\n\n".join(parts)

    @staticmethod
    def _system_prompt(mode: str, role: str) -> str:
        """
        Role-aware and mode-aware system instruction sent to GPT-4o.
        """
        base = (
            "You are Laboracle, an AI assistant for an educational platform. "
            "You answer questions strictly based on the context excerpts provided below. "
            "Always be accurate — if the answer is not in the context, say so clearly "
            "instead of guessing."
        )

        role_hint = (
            "You are speaking with a TEACHER. Use precise, professional language "
            "and you may include curriculum-level insights."
            if role == 'teacher'
            else
            "You are speaking with a STUDENT. Use clear, friendly language "
            "and explain concepts simply."
        )

        mode_hint = (
            "Stick strictly to what the documents say. Do not add information from outside the context."
            if mode == 'deterministic'
            else
            "After answering from the documents, you may briefly suggest related ideas "
            "or real-world connections to enrich the student's understanding."
        )

        return f"{base}\n\n{role_hint}\n\n{mode_hint}"

    @staticmethod
    def _build_citations(docs: list, scores: list) -> List[str]:
        """
        Return de-duplicated citation strings for each unique source chunk.
        Format: 'filename — chunk N (score: X.XX)'
        Lower L2 score = more relevant.
        """
        seen, out = set(), []
        for doc, score in zip(docs, scores):
            meta     = doc.metadata
            filename = meta.get('filename', 'Unknown')
            chunk_n  = meta.get('chunk_index', 0) + 1
            cit      = f"{filename} — chunk {chunk_n} (score: {score:.3f})"
            if cit not in seen:
                out.append(cit)
                seen.add(cit)
        return out

    @staticmethod
    def _calculate_confidence(scores: list, answer: str) -> int:
        """
        Heuristic confidence score (0-100) based on:
          - FAISS L2 similarity scores (lower = better)
          - Number of retrieved chunks
          - Presence of hedging language in the answer
        """
        if not scores:
            return 40

        # Convert L2 distance to a 0–1 similarity (assumes scores < 2 for good matches)
        similarities = [max(0.0, 1.0 - (s / 2.0)) for s in scores]
        avg_sim      = sum(similarities) / len(similarities)

        # Base: up to 70 from similarity, up to 20 from answer length
        base   = int(avg_sim * 70)
        length = min(len(answer.split()) / 80, 1.0) * 20

        # Deduct for hedging words
        hedges  = sum(
            1 for w in ['might', 'maybe', 'perhaps', 'unclear', 'not sure', 'possibly', 'i think']
            if w in answer.lower()
        )
        penalty = hedges * 5

        score = int(base + length - penalty)
        return max(45, min(95, score))
