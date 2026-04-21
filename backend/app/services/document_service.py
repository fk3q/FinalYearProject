"""
Document processing service
- Reads PDF / DOCX / TXT files
- Splits into paragraphs via RecursiveCharacterTextSplitter
- Embeds with OpenAI text-embedding-3-small
- Persists chunks + embeddings + metadata in a local FAISS index
"""

import os
import json
import re
import uuid
import tempfile
import pickle
from datetime import datetime
from typing import List, Dict, Any, Optional

from fastapi import UploadFile

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader, TextLoader
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import FAISS

from app.config import settings
from app.models.schemas import DocumentUploadResponse


# ── Paths for persisting FAISS index and metadata on disk ──────────────────
FAISS_DIR      = os.path.join(os.path.dirname(__file__), '../../faiss_store')
FAISS_INDEX    = os.path.join(FAISS_DIR, 'index')          # FAISS saves index.faiss / index.pkl
METADATA_FILE  = os.path.join(FAISS_DIR, 'metadata.json')  # per-chunk metadata


def load_all_document_metadata() -> List[Dict[str, Any]]:
    """
    Read the on-disk per-chunk metadata file. Used by the admin dashboard so it
    can aggregate document info across all users without pulling the full FAISS
    index into memory again.
    """
    if not os.path.exists(METADATA_FILE):
        return []
    try:
        with open(METADATA_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def summarize_documents_by_user() -> Dict[int, List[Dict[str, Any]]]:
    """
    Collapse the per-chunk metadata into one entry per (owner, document_id).
    Returns a mapping of ``owner_user_id -> [document summary, ...]``.
    """
    all_meta = load_all_document_metadata()
    seen: Dict[tuple, Dict[str, Any]] = {}
    for meta in all_meta:
        owner = meta.get("owner_user_id")
        doc_id = meta.get("document_id")
        if owner is None or not doc_id:
            continue
        key = (int(owner), doc_id)
        if key in seen:
            continue
        seen[key] = {
            "document_id":       doc_id,
            "filename":          meta.get("filename"),
            "original_filename": meta.get("original_filename") or meta.get("filename"),
            "doc_type":          meta.get("doc_type"),
            "total_chunks":      int(meta.get("total_chunks") or 0),
            "file_size_kb":      float(meta.get("file_size_kb") or 0),
            "chunked_at":        meta.get("chunked_at"),
        }
    grouped: Dict[int, List[Dict[str, Any]]] = {}
    for (owner, _), doc in seen.items():
        grouped.setdefault(owner, []).append(doc)
    for owner in grouped:
        grouped[owner].sort(key=lambda d: (d.get("chunked_at") or ""), reverse=True)
    return grouped


class DocumentService:
    """Handles upload → split → embed → FAISS storage."""

    def __init__(self):
        os.makedirs(FAISS_DIR, exist_ok=True)

        self.embeddings = OpenAIEmbeddings(
            model=settings.EMBEDDING_MODEL,
            openai_api_key=settings.OPENAI_API_KEY,
        )

        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP,
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

        # Load existing FAISS index if it exists, otherwise start fresh
        self._vector_store: FAISS | None = self._load_index()
        # per-chunk metadata list (parallel order to FAISS internal IDs)
        self._metadata: List[Dict[str, Any]] = self._load_metadata()

    # ── Public API ───────────────────────────────────────────────────────────

    async def process_and_store_document(
        self,
        file: UploadFile,
        owner_user_id: int,
        owner_label: Optional[str] = None,
    ) -> DocumentUploadResponse:
        """
        Full pipeline:
          1. validate extension
          2. save to temp file
          3. load with LangChain loader
          4. split into chunks
          5. embed + add to FAISS (each chunk tagged with owner_user_id)
          6. persist index + metadata to disk

        Documents are isolated per owner: every chunk stores `owner_user_id` in
        its metadata, and the displayed filename is prefixed with the owner
        label (e.g. ``furqan__notes.pdf``) for visibility. Retrieval at query
        time enforces a strict metadata filter on `owner_user_id`.
        """
        if not isinstance(owner_user_id, int) or owner_user_id < 1:
            raise ValueError("Sign in to upload documents (owner_user_id missing).")

        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in {'.pdf', '.docx', '.txt'}:
            raise ValueError(f"Unsupported file type '{ext}'. Allowed: .pdf .docx .txt")

        document_id   = str(uuid.uuid4())
        file_size_kb  = 0
        tmp_path      = ''

        try:
            # Save upload to a temp file so loaders can open it by path
            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
                content = await file.read()
                file_size_kb = round(len(content) / 1024, 2)
                tmp.write(content)
                tmp_path = tmp.name

            # Load document pages
            docs = self._load_document(tmp_path, ext)

            # Split into chunks
            chunks = self.splitter.split_documents(docs)
            if not chunks:
                raise ValueError("Document appears to be empty or could not be parsed.")

            chunk_time = datetime.utcnow().isoformat()
            owner_slug = self._slugify_owner(owner_label) or f"user{owner_user_id}"
            display_filename = f"{owner_slug}__{file.filename}"

            # Build rich metadata for each chunk
            chunk_texts = []
            chunk_metas = []
            for i, chunk in enumerate(chunks):
                meta = {
                    "document_id":  document_id,
                    "filename":     display_filename,
                    "original_filename": file.filename,
                    "owner_user_id": int(owner_user_id),
                    "owner_label":  owner_slug,
                    "file_size_kb": file_size_kb,
                    "doc_type":     ext.lstrip('.').upper(),
                    "chunk_index":  i,
                    "total_chunks": len(chunks),
                    "chunked_at":   chunk_time,
                    "page":         chunk.metadata.get("page", 0),
                }
                chunk.metadata.update(meta)
                chunk_texts.append(chunk.page_content)
                chunk_metas.append(meta)

            # Embed + insert into FAISS
            if self._vector_store is None:
                self._vector_store = FAISS.from_texts(
                    texts=chunk_texts,
                    embedding=self.embeddings,
                    metadatas=chunk_metas,
                )
            else:
                self._vector_store.add_texts(
                    texts=chunk_texts,
                    metadatas=chunk_metas,
                )

            # Persist to disk
            self._vector_store.save_local(FAISS_INDEX)
            self._metadata.extend(chunk_metas)
            self._save_metadata()

            return DocumentUploadResponse(
                document_id=document_id,
                filename=display_filename,
                total_chunks=len(chunks),
                status="success",
                message=(
                    f"'{file.filename}' processed successfully — "
                    f"{len(chunks)} chunks embedded and stored privately for "
                    f"{owner_slug}."
                ),
            )

        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)

    def get_vector_store(self) -> FAISS | None:
        """Return the in-memory FAISS store (used by ChatService)."""
        return self._vector_store

    async def get_chunk_count(self, owner_user_id: Optional[int] = None) -> int:
        if self._vector_store is None:
            return 0
        if owner_user_id is None:
            return self._vector_store.index.ntotal
        return sum(1 for m in self._metadata if m.get("owner_user_id") == owner_user_id)

    def list_user_documents(self, owner_user_id: int) -> List[Dict[str, Any]]:
        """Return one summary entry per document owned by `owner_user_id`."""
        seen: Dict[str, Dict[str, Any]] = {}
        for meta in self._metadata:
            if meta.get("owner_user_id") != owner_user_id:
                continue
            doc_id = meta.get("document_id")
            if not doc_id or doc_id in seen:
                continue
            seen[doc_id] = {
                "document_id":      doc_id,
                "filename":         meta.get("filename"),
                "original_filename": meta.get("original_filename"),
                "doc_type":         meta.get("doc_type"),
                "total_chunks":     meta.get("total_chunks"),
                "file_size_kb":     meta.get("file_size_kb"),
                "chunked_at":       meta.get("chunked_at"),
            }
        return list(seen.values())

    async def delete_document(
        self,
        document_id: str,
        owner_user_id: Optional[int] = None,
    ) -> dict:
        """
        FAISS does not support per-ID deletion efficiently.
        Rebuild the index without the target document's chunks.

        When `owner_user_id` is given, the caller must own the document or a
        PermissionError is raised (so users can't delete each other's files).
        """
        targeted = [m for m in self._metadata if m.get("document_id") == document_id]
        if not targeted:
            return {"status": "not_found", "document_id": document_id, "deleted_chunks": 0}

        if owner_user_id is not None:
            owners = {m.get("owner_user_id") for m in targeted}
            if owners != {int(owner_user_id)}:
                raise PermissionError(
                    "You do not have permission to delete this document."
                )

        remaining_meta = [m for m in self._metadata if m.get("document_id") != document_id]
        removed = len(self._metadata) - len(remaining_meta)

        # Rebuild the FAISS index without the deleted document's chunks so the
        # vectors can no longer surface in similarity search.
        self._rebuild_index_excluding(document_id)
        self._metadata = remaining_meta
        self._save_metadata()

        return {
            "status": "success",
            "document_id": document_id,
            "deleted_chunks": removed,
        }

    def _rebuild_index_excluding(self, document_id: str) -> None:
        """Drop all FAISS vectors whose metadata.document_id == document_id."""
        if self._vector_store is None:
            return

        docstore_dict = getattr(self._vector_store.docstore, "_dict", None)
        if not docstore_dict:
            return

        ids_to_drop = [
            doc_id for doc_id, stored_doc in docstore_dict.items()
            if stored_doc.metadata.get("document_id") == document_id
        ]
        if not ids_to_drop:
            return

        try:
            self._vector_store.delete(ids_to_drop)
        except Exception:
            # Fallback: rebuild from remaining texts (re-embeds via OpenAI).
            kept_texts: List[str] = []
            kept_metas: List[Dict[str, Any]] = []
            for stored_doc in docstore_dict.values():
                if stored_doc.metadata.get("document_id") == document_id:
                    continue
                kept_texts.append(stored_doc.page_content)
                kept_metas.append(dict(stored_doc.metadata))
            if not kept_texts:
                self._vector_store = None
            else:
                self._vector_store = FAISS.from_texts(
                    texts=kept_texts,
                    embedding=self.embeddings,
                    metadatas=kept_metas,
                )

        if self._vector_store is None or self._vector_store.index.ntotal == 0:
            self._vector_store = None
            for fname in ("index.faiss", "index.pkl"):
                fpath = os.path.join(FAISS_DIR, fname)
                if os.path.exists(fpath):
                    try:
                        os.remove(fpath)
                    except OSError:
                        pass
            return

        self._vector_store.save_local(FAISS_INDEX)

    # ── Internal helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _slugify_owner(label: Optional[str]) -> str:
        if not label:
            return ""
        slug = re.sub(r"[^a-zA-Z0-9]+", "_", label.strip().lower()).strip("_")
        return slug[:32]

    @staticmethod
    def _load_document(path: str, ext: str):
        if ext == '.pdf':
            return PyPDFLoader(path).load()
        if ext == '.docx':
            return Docx2txtLoader(path).load()
        return TextLoader(path, encoding='utf-8').load()

    def _load_index(self) -> 'FAISS | None':
        idx_file = FAISS_INDEX + '.faiss'
        if os.path.exists(idx_file):
            try:
                return FAISS.load_local(
                    FAISS_INDEX,
                    embeddings=self.embeddings,
                    allow_dangerous_deserialization=True,
                )
            except Exception:
                pass
        return None

    def _load_metadata(self) -> List[Dict[str, Any]]:
        if os.path.exists(METADATA_FILE):
            try:
                with open(METADATA_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
        return []

    def _save_metadata(self):
        with open(METADATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(self._metadata, f, indent=2)
