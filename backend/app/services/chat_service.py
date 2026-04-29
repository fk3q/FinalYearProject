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

from fastapi import HTTPException
from langchain_openai import OpenAIEmbeddings

from app.config import settings
from app.models.schemas import ChatResponse
from app.services import user_service
from app.services.document_service import DocumentService
from app.services.llm import registry


class ChatService:
    """Full RAG pipeline: embed → FAISS search → multi-provider answer."""

    def __init__(self, document_service: DocumentService):
        self._doc_service = document_service

        # Same embedding model as document_service so vectors are comparable.
        # Embedding stays single-provider (OpenAI) on purpose -- mixing
        # embedding spaces across vendors would invalidate the entire FAISS
        # index. The choice of *generation* model is what we're widening.
        self._embeddings = OpenAIEmbeddings(
            model=settings.EMBEDDING_MODEL,
            openai_api_key=settings.OPENAI_API_KEY,
        )

    # ── Public API ────────────────────────────────────────────────────────────

    async def process_query(
        self,
        query: str,
        mode: str = 'deterministic',
        user_role: str = 'student',
        owner_user_id: Optional[int] = None,
        model: Optional[str] = None,
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

        # ── Resolve which model to use (tier-checked) ──────────────────────
        # The route layer already validated `model` belongs to the user's
        # tier, but we double-check here as a defense-in-depth measure.
        chosen_model = self._resolve_model(model, owner_user_id)

        # ── Guard: no documents at all ───────────────────────────────────────
        # The four modes split into two camps:
        #   · MUST have uploaded docs: deterministic, test
        #     (a "test on your notes" or "answer strictly from your
        #     uploads" doesn't make sense without a corpus)
        #   · ALLOW general-chat fallback: exploratory, research
        #     (research mode still has utility -- "what's a lit review?",
        #     "how do I structure a methods section?" -- without docs)
        vector_store = self._doc_service.get_vector_store()
        if vector_store is None:
            if mode in ("deterministic", "test"):
                if mode == "test":
                    return ChatResponse(
                        answer=(
                            "Test mode quizzes you on the documents you've "
                            "uploaded. Head to the Upload page and add a "
                            "document (lecture notes, a textbook chapter, "
                            "a syllabus) and I'll generate a quiz from it."
                        ),
                        confidence=0,
                        citations=[],
                        mode=mode,
                        retrieved_chunks=0,
                    )
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
            return await self._answer_without_context(
                query, mode, user_role, chosen_model,
            )

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
            # Same split as the no-documents case above: deterministic +
            # test require docs (they say "no relevant content"), while
            # exploratory + research fall through to a general answer.
            if mode in ("deterministic", "test"):
                if mode == "test":
                    return ChatResponse(
                        answer=(
                            "I couldn't find anything in your uploaded "
                            "documents that matches that topic to build a "
                            "test from. Try a broader prompt (e.g. \"test "
                            "me on chapter 3\") or upload more material."
                        ),
                        confidence=40,
                        citations=[],
                        mode=mode,
                        retrieved_chunks=0,
                    )
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
            return await self._answer_without_context(
                query, mode, user_role, chosen_model,
            )

        docs   = [doc   for doc, _     in results]
        scores = [score for _,   score in results]

        # ── Step 3: build context string ─────────────────────────────────────
        context = self._build_context(docs)

        # ── Step 4: dispatch to the chosen provider ─────────────────────────
        system_prompt = self._system_prompt(mode, user_role)
        user_message  = (
            f"Context from uploaded documents:\n"
            f"---\n{context}\n---\n\n"
            f"Question: {query}"
        )

        answer = await self._invoke_llm(chosen_model, system_prompt, user_message)

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
        model: str,
    ) -> ChatResponse:
        """
        Exploratory-mode fallback when there's nothing to retrieve from --
        either because the user hasn't uploaded any documents yet or because
        none of their uploads matched the query. We let the chosen LLM
        answer from general knowledge so the user can keep chatting freely;
        citations come back empty and confidence is fixed (no FAISS signal
        to lean on).
        """
        system_prompt = self._system_prompt_general(mode, user_role)
        answer = await self._invoke_llm(model, system_prompt, query)

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

    # ── Model dispatch ────────────────────────────────────────────────

    def _resolve_model(self, requested: Optional[str], user_id: Optional[int]) -> str:
        """
        Pick the model id we're going to send the prompt to.

        Resolution order:
          1. If `requested` is set and the user's tier permits it AND the
             provider is configured -> use it.
          2. Otherwise, fall back to settings.DEFAULT_MODEL if it's
             permitted and available for this tier.
          3. Otherwise, pick the cheapest available model for this tier.
          4. If nothing is reachable, raise a 503 (no LLM provider
             configured at all).

        Tier validation duplicates what the route layer already enforces,
        but defense-in-depth is cheap and prevents a buggy frontend from
        accidentally upgrading a Free user to Opus.
        """
        tier = self._tier_for(user_id)

        if requested:
            err = registry.check_access(requested, tier)
            if err:
                # Surface as 403 so the frontend can show the upgrade
                # prompt instead of treating it as a generic 500.
                raise HTTPException(status_code=403, detail=err)
            return requested

        # No explicit choice -- try the configured default.
        default_id = settings.DEFAULT_MODEL
        if default_id and registry.check_access(default_id, tier) is None:
            return default_id

        # Default is not reachable for this user -- find any allowed
        # model whose provider is configured.
        fallback = registry.fallback_for(tier)
        if fallback is None:
            raise HTTPException(
                status_code=503,
                detail=(
                    "No language model is configured on this server. "
                    "Set OPENAI_API_KEY (and optionally ANTHROPIC_API_KEY / "
                    "GOOGLE_API_KEY) and restart."
                ),
            )
        return fallback.id

    async def _invoke_llm(self, model_id: str, system: str, user: str) -> str:
        """
        Single point through which every LLM call flows. Keeps the
        per-vendor wiring (LangChain wrappers, API key plumbing) out of
        the RAG/no-context paths.
        """
        provider = registry.provider_for(model_id)
        vendor_model = registry.vendor_model_id(model_id)
        return await provider.chat(
            model_id=vendor_model,
            system=system,
            user=user,
            max_tokens=settings.LLM_MAX_TOKENS,
            temperature=settings.LLM_TEMPERATURE,
        )

    @staticmethod
    def _tier_for(user_id: Optional[int]) -> str:
        """Cheap tier lookup mirroring quota_service._tier_for."""
        if not user_id:
            return "free"
        row = user_service.get_public_user_by_id(int(user_id))
        return str((row or {}).get("subscription_tier") or "free")

    @staticmethod
    def _system_prompt_general(mode: str, role: str) -> str:
        """
        System prompt for the no-context (general-knowledge) path. Used
        by the modes that *allow* a general fallback (exploratory,
        research). Deterministic + test modes never reach this code
        path -- they bail with an "upload first" message instead.

        Differs from `_system_prompt` in two ways:
          1. No "answer strictly from the context excerpts" clause --
             there are no excerpts.
          2. Tells the LLM to invite the user to upload documents if they
             want a more grounded answer, so the feature is discoverable.
        """
        if mode == "research":
            base = (
                "You are Laboracle in Research Mode. The user is working "
                "academically (likely a university student or researcher) "
                "and has not yet uploaded any documents matching this "
                "question. Help them with the research process itself: "
                "explaining methodologies, suggesting paper structures, "
                "framing research questions, recommending where to look "
                "for sources, drafting outlines, etc. Use a precise, "
                "academic tone with appropriate hedging. Encourage the "
                "user to upload primary sources so you can switch to "
                "document-grounded analysis in the next turn."
            )
        else:
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
        Role-aware and mode-aware system instruction sent to the LLM
        when we have document context to ground in. Switches
        personality + output shape per mode:

          · deterministic -- fact extractor; cites and refuses to guess
          · exploratory   -- grounded answer + curated digressions
          · test          -- quiz-master; produces structured MCQ +
                             short-answer + true/false batches with
                             answer keys
          · research      -- academic synthesist; cites every claim,
                             produces literature-review style notes
                             with hedged phrasing
        """
        # Per-mode "what kind of assistant am I?" preamble. Each preamble
        # is self-contained so we never mix instructions across modes.
        if mode == "test":
            base = (
                "You are Laboracle in Test Mode -- an AI quiz-master that "
                "helps the student practise on the documents they uploaded. "
                "Use the context excerpts as the source of truth for every "
                "question and every answer.\n\n"
                "When the student asks for a quiz (or just opens chat in "
                "Test mode without specifying), produce EXACTLY this "
                "structure in plain Markdown:\n\n"
                "**Mini-test (5 questions)**\n"
                "1. Multiple choice — stem + 4 options (A, B, C, D).\n"
                "2. Multiple choice — stem + 4 options.\n"
                "3. Multiple choice — stem + 4 options.\n"
                "4. Short answer — expects a 1-2 sentence response.\n"
                "5. True / False — with a one-line justification field.\n\n"
                "Then, separated by `---`, an **Answer key** section "
                "containing the correct answer for every item plus a "
                "brief explanation that quotes or paraphrases the "
                "supporting chunk (e.g. `[1] notes.pdf — chunk 3`).\n\n"
                "If the student gives ANSWERS to a previous question set, "
                "grade each one (✅ correct / ❌ incorrect) and explain "
                "the right answer. If the student asks for a single "
                "question on a specific topic, produce just one question "
                "with its answer hidden under a `<details>` block. Stay "
                "encouraging but honest -- never tell a student a wrong "
                "answer is right."
            )
        elif mode == "research":
            base = (
                "You are Laboracle in Research Mode -- an AI research "
                "assistant for university-level work. Treat the uploaded "
                "documents as primary sources and reason about them "
                "academically.\n\n"
                "Default behaviours when the student asks an open "
                "question or for a summary:\n"
                "  · Cite every non-trivial claim inline using "
                "`[filename — chunk N]` referencing the context block.\n"
                "  · Use precise, hedged academic English ('the source "
                "argues', 'according to X', 'this suggests'). Avoid "
                "overclaiming what the source supports.\n"
                "  · Structure long answers with clear section headings "
                "(### Summary / ### Key claims / ### Methodology / "
                "### Limitations / ### Open questions).\n"
                "  · Always close with a short 'Limitations of the "
                "source' note flagging what these documents do NOT "
                "cover.\n\n"
                "Capabilities the user may invoke explicitly:\n"
                "  · 'Summarise…' -> thematic summary with citations.\n"
                "  · 'Cornell notes for…' -> two-column cue/notes "
                "format with a summary footer.\n"
                "  · 'Outline…'   -> hierarchical bullet outline.\n"
                "  · 'Key terms / definitions' -> glossary table "
                "(term | definition | source).\n"
                "  · 'Compare X and Y' -> side-by-side table with a "
                "synthesis paragraph after.\n"
                "  · 'Research questions' -> 5 follow-up questions the "
                "documents leave open.\n"
                "  · 'Methodology / findings' -> extract the methods "
                "and headline findings of each cited paper.\n"
                "  · 'Lit-review draft' -> short literature-review-style "
                "synthesis (300-400 words) tying the documents together.\n"
                "  · 'Citation export' -> APA-style citation lines for "
                "the underlying source files (filename, no inferred "
                "metadata)."
            )
        else:
            # deterministic / exploratory share the same grounded base.
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

        # Per-mode trailing nudge. Test and research already encoded
        # everything they need in `base`, so the trailing hint is only
        # used by the two original modes.
        if mode == "deterministic":
            mode_hint = (
                "Stick strictly to what the documents say. Do not add "
                "information from outside the context."
            )
        elif mode == "exploratory":
            mode_hint = (
                "After answering from the documents, you may briefly "
                "suggest related ideas or real-world connections to "
                "enrich the student's understanding."
            )
        else:
            mode_hint = ""

        parts = [base, role_hint]
        if mode_hint:
            parts.append(mode_hint)
        return "\n\n".join(parts)

    @staticmethod
    def _build_citations(docs: list, scores: list) -> List[str]:
        """
        Return de-duplicated, human-readable citation strings -- one per
        unique source chunk, ordered by relevance.

        Format choices, by priority:
          · PDF with a real page number      -> "notes.pdf — page 5"
          · DOCX/TXT or PDFs without pages   -> "notes.docx — passage 3 of 17"

        We deliberately:
          · prefer `original_filename` over `filename`, because the
            stored filename is prefixed with an internal owner slug
            (e.g. ``user42__notes.pdf``) that students shouldn't see.
          · drop the FAISS L2 distance from the visible string -- it's
            an internal debugging signal, not a citation. Confidence
            score on the message bubble already conveys "how grounded
            is this answer" to the user.
        """
        seen: set = set()
        out: List[str] = []
        for doc, _score in zip(docs, scores):
            meta = doc.metadata
            display_name = (
                meta.get('original_filename')
                or meta.get('filename')
                or 'Unknown source'
            )
            page = meta.get('page', 0)
            chunk_n = int(meta.get('chunk_index', 0)) + 1
            total = int(meta.get('total_chunks', 0))

            # Page numbers from langchain's PDF loader are 0-based, but
            # only when the doc actually came from a paged source. For
            # non-paged formats `page` defaults to 0 in our metadata, so
            # we treat any value > 0 as "real page info".
            try:
                page_int = int(page)
            except (TypeError, ValueError):
                page_int = 0

            if page_int > 0:
                cit = f"{display_name} — page {page_int}"
            elif total > 0:
                cit = f"{display_name} — passage {chunk_n} of {total}"
            else:
                cit = f"{display_name} — passage {chunk_n}"

            if cit not in seen:
                out.append(cit)
                seen.add(cit)
        return out

    @staticmethod
    def _calculate_confidence(scores: list, answer: str) -> int:
        """
        Heuristic confidence score (0-100) shown next to bot replies.

        Inputs and weights:
          · FAISS L2 similarity (top retrieved chunks)  -> up to 75 pts
            (each chunk's L2 distance is mapped to a 0-1 similarity
            assuming ~2.0 is "no match"; the average of all retrieved
            chunks is used so a single great hit + several mediocre
            ones reads as "moderately confident", not "confident").
          · Answer length sanity                         -> up to 15 pts
            (very short answers usually mean the model gave up; very
            long answers without grounding shouldn't pad the score
            either, so the curve plateaus around 80 words).
          · Hedging language penalty                     -> -5 each
          · "I cannot find / not in the context" detection -> hard
            cap at 35 (overrides everything; the model is explicitly
            telling the user the docs don't answer the question).

        Range is clamped to [20, 95] -- never 0 (we always have some
        grounding) and never 100 (heuristics shouldn't claim certainty).
        """
        if not scores:
            # No retrieval at all -- this path only runs for the
            # general-knowledge fallback in exploratory/research modes.
            return 60

        lower = answer.lower()

        # Hard cap when the model itself is admitting no answer. These
        # phrases come from our own deterministic-mode "no relevant
        # results" copy as well as from the LLM when it can't ground
        # an answer in the provided context.
        bail_phrases = (
            "i cannot find",
            "i could not find",
            "could not find information",
            "not in the context",
            "no relevant",
            "the documents do not",
            "the documents don't",
        )
        if any(p in lower for p in bail_phrases):
            return 25

        # Convert L2 distance to 0-1 similarity (FAISS L2 with
        # OpenAI text-embedding-3-small lands ~0.4-1.5 for genuine
        # matches; ~2.0+ means unrelated content).
        similarities = [max(0.0, 1.0 - (s / 2.0)) for s in scores]
        avg_sim = sum(similarities) / len(similarities)

        # Base contribution from retrieval similarity.
        base = int(avg_sim * 75)

        # Length bonus: rewards substantive answers without padding
        # for verbose-but-empty replies. Plateaus at ~80 words.
        length_bonus = int(min(len(answer.split()) / 80, 1.0) * 15)

        # Hedge penalty -- each hedging phrase deducts 5 points.
        hedges = sum(
            1 for w in (
                "might", "maybe", "perhaps", "unclear", "not sure",
                "possibly", "i think", "i'm not sure",
            )
            if w in lower
        )
        penalty = hedges * 5

        score = base + length_bonus - penalty
        return max(20, min(95, int(score)))
