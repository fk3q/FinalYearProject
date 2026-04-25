"""
FastAPI entry point – Laboracle backend
"""

import logging
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from app.config import settings
from app.services.document_service import DocumentService
from app.services.chat_service import ChatService
from app.models.schemas import (
    DocumentUploadResponse,
    ChatRequest,
    ChatResponse,
    HealthResponse,
)
from app.routers.auth import router as auth_router, users_router
from app.routers.admin import router as admin_router
from app.routers.payments import router as payments_router
from app.services import chat_history_service, user_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from app.db.mysql_db import init_db_schema

        init_db_schema()
    except Exception as exc:
        logger.warning(
            "MySQL users table init failed — auth routes will fail until DB is configured: %s",
            exc,
        )
    yield


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Laboracle API",
    description="RAG-based Q&A — FAISS + OpenAI embeddings + GPT-4o",
    version="2.0.0",
    lifespan=lifespan,
)

# Global exception handler — prints full traceback to docker logs
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception on %s:\n%s", request.url, traceback.format_exc())
    return JSONResponse(status_code=500, content={"detail": str(exc)})

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Services (singletons, shared state) ───────────────────────────────────────
document_service = DocumentService()
chat_service     = ChatService(document_service)

app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(payments_router, prefix="/api")


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/", response_model=HealthResponse)
@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="healthy",
        message="Laboracle API is running",
        timestamp=datetime.utcnow().isoformat(),
    )


@app.post("/api/documents/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    user_id: int = Form(..., ge=1),
):
    """
    Accept a PDF, DOCX, or TXT file uploaded by a signed-in user.
    Splits it into paragraphs, embeds each chunk, and stores in FAISS with
    metadata tagged to `user_id` so only that user can query it later.
    """
    logger.info(
        "Upload request: filename=%s user_id=%s content_type=%s",
        file.filename, user_id, file.content_type,
    )

    user_row = user_service.get_public_user_by_id(user_id)
    if not user_row:
        raise HTTPException(status_code=401, detail="Unknown user_id; please sign in again.")

    owner_label = (
        user_row.get("first_name")
        or (user_row.get("email") or "").split("@")[0]
        or f"user{user_id}"
    )

    try:
        result = await document_service.process_and_store_document(
            file,
            owner_user_id=user_id,
            owner_label=owner_label,
        )
        logger.info(
            "Upload success: %s (owner=%s) — %d chunks",
            file.filename, owner_label, result.total_chunks,
        )
        return result
    except ValueError as exc:
        logger.warning("Upload validation error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Upload failed for %s:\n%s", file.filename, traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Processing error: {exc}")


@app.post("/api/chat/query", response_model=ChatResponse)
async def chat_query(request: ChatRequest):
    """
    Embeds the user query, retrieves top-5 chunks from FAISS,
    and generates a grounded answer with GPT-4o.
    When `user_id` is set, the user/assistant pair is stored for later (see chat-sessions APIs).
    """
    if request.session_id is not None and request.user_id is None:
        raise HTTPException(
            status_code=400,
            detail="user_id is required when continuing a saved chat (session_id).",
        )
    logger.info(
        "Chat query: '%s' | mode=%s role=%s user_id=%s",
        request.query[:80], request.mode, request.user_role, request.user_id,
    )
    try:
        result = await chat_service.process_query(
            query=request.query,
            mode=request.mode,
            user_role=request.user_role,
            owner_user_id=request.user_id,
        )
        logger.info("Chat success: confidence=%d, chunks=%d", result.confidence, result.retrieved_chunks)
    except Exception as exc:
        logger.error("Chat query failed:\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Query error: {exc}") from exc

    session_id_saved: int | None = None
    if request.user_id is not None:
        try:
            row = user_service.get_public_user_by_id(request.user_id)
            if row:
                sid, err = chat_history_service.resolve_session_id(
                    request.user_id,
                    request.session_id,
                    request.query,
                )
                if err is None and sid is not None:
                    chat_history_service.append_exchange(
                        sid,
                        request.query,
                        result.answer,
                        result.confidence,
                        list(result.citations),
                    )
                    session_id_saved = sid
        except Exception as exc:
            logger.warning("Chat history save skipped: %s", exc)

    if session_id_saved is not None:
        return result.model_copy(update={"session_id": session_id_saved})
    return result


@app.get("/api/documents/count")
async def chunk_count(user_id: int | None = Query(default=None, ge=1)):
    """
    Return the FAISS chunk count.
    When `user_id` is provided, only that user's chunks are counted.
    """
    count = await document_service.get_chunk_count(owner_user_id=user_id)
    return {"total_chunks": count, "user_id": user_id, "status": "success"}


@app.get("/api/documents")
async def list_documents(user_id: int = Query(..., ge=1)):
    """List documents owned by `user_id`. Other users' files are never returned."""
    if not user_service.get_public_user_by_id(user_id):
        raise HTTPException(status_code=401, detail="Unknown user_id; please sign in again.")
    return {"documents": document_service.list_user_documents(user_id)}


@app.delete("/api/documents/{document_id}")
async def delete_document(document_id: str, user_id: int = Query(..., ge=1)):
    """
    Delete a document. The caller must own it; otherwise 403 is returned so
    that one user can never wipe another user's uploads.
    """
    if not user_service.get_public_user_by_id(user_id):
        raise HTTPException(status_code=401, detail="Unknown user_id; please sign in again.")
    try:
        return await document_service.delete_document(document_id, owner_user_id=user_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── Dev runner ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=(settings.ENVIRONMENT == "development"),
    )
