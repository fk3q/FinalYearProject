"""
FastAPI entry point – Laboracle backend
"""

import logging
import traceback
from contextlib import asynccontextmanager

from typing import Any, Dict

from fastapi import Depends, FastAPI, UploadFile, File, Form, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime
import uvicorn

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from app.config import settings
from app.dependencies import require_user
from app.services.document_service import DocumentService
from app.services.chat_service import ChatService
from app.models.schemas import (
    DocumentUploadResponse,
    ChatRequest,
    ChatResponse,
    HealthResponse,
    ModelInfoResponse,
    ModelsResponse,
)
from app.services.llm import registry as model_registry
from app.routers.auth import router as auth_router, users_router
from app.routers.admin import router as admin_router
from app.routers.payments import router as payments_router
from app.routers.notifications import router as notifications_router
from app.services import (
    chat_history_service,
    quota_service,
    reminder_scheduler,
    user_service,
    voice_service,
)
from app.services.document_service import (
    MAX_UPLOAD_BYTES,
    get_upload_limit_for_tier,
)
from app.services.voice_service import MAX_AUDIO_BYTES


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Refuse to boot with insecure config in production ────────────────────
    problems = settings.validate_for_runtime()
    if problems:
        joined = "\n  - ".join(problems)
        msg = (
            f"Refusing to start: {len(problems)} configuration issue(s):\n  - {joined}\n"
            "Fix the env vars and restart, or set ENVIRONMENT=development to bypass."
        )
        if settings.is_production():
            # Hard fail in production — don't silently boot with weak admin
            # creds, test Stripe keys, or open CORS.
            raise RuntimeError(msg)
        logger.warning(msg)

    try:
        from app.db.mysql_db import init_db_schema

        init_db_schema()
    except Exception as exc:
        logger.warning(
            "MySQL users table init failed — auth routes will fail until DB is configured: %s",
            exc,
        )

    # ── Reminder scheduler ───────────────────────────────────────────────────
    # Boots APScheduler with the Mon+Thu 09:00 UTC cron triggers that
    # power the bell-icon dropdown + reminder emails. Failures here
    # are isolated -- if APScheduler isn't installed yet (older image)
    # the function logs a warning and the rest of the app keeps
    # running, just without the bi-weekly nudges.
    try:
        reminder_scheduler.start_scheduler()
    except Exception:
        logger.exception("reminder scheduler failed to start")

    try:
        yield
    finally:
        try:
            reminder_scheduler.stop_scheduler()
        except Exception:
            logger.exception("reminder scheduler shutdown failed")


# ── Rate limiting ─────────────────────────────────────────────────────────────
# Per-IP throttle for the noisy public endpoints (login, register, password
# reset, captcha, chat). Quotas are tier-based and live separately in
# `quota_service`. The limiter falls back to the connecting IP via
# `get_remote_address`; behind nginx this is the X-Forwarded-For first hop.
limiter = Limiter(key_func=get_remote_address, default_limits=[])


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Laboracle API",
    description="RAG-based Q&A — FAISS + OpenAI embeddings + GPT-4o",
    version="2.0.0",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
app.include_router(notifications_router, prefix="/api")


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
    request: Request,
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(require_user),
):
    """
    Accept a PDF, DOCX, or TXT file uploaded by the signed-in user.
    Splits it into paragraphs, embeds each chunk, and stores in FAISS with
    metadata tagged to the bearer-token user so only they can query it later.
    """
    # Cheap pre-check based on the request header so a multi-GB upload is
    # rejected before we buffer any of it. We use the per-tier soft cap here
    # so Advanced subscribers can upload bigger files than Free users; the
    # streaming reader inside DocumentService still re-enforces the global
    # MAX_UPLOAD_BYTES ceiling as a backstop in case a client lies about
    # Content-Length.
    user_tier = (current_user.get("subscription_tier") or "free").strip().lower()
    tier_limit_bytes = get_upload_limit_for_tier(user_tier)
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > tier_limit_bytes:
        tier_label = user_tier.capitalize() or "Free"
        raise HTTPException(
            status_code=413,
            detail=(
                f"File too large. {tier_label} plan uploads are capped at "
                f"{tier_limit_bytes // (1024 * 1024)} MB. Upgrade your plan "
                f"for higher per-file limits."
            ),
        )

    user_id = int(current_user["id"])
    logger.info(
        "Upload request: filename=%s user_id=%s content_type=%s",
        file.filename, user_id, file.content_type,
    )

    try:
        quota_service.check_and_increment(user_id, "upload")
    except quota_service.QuotaExceeded as e:
        raise HTTPException(status_code=429, detail=str(e))

    owner_label = (
        current_user.get("first_name")
        or (current_user.get("email") or "").split("@")[0]
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
@limiter.limit("20/minute")
async def chat_query(
    request: Request,
    body: ChatRequest,
    current_user: Dict[str, Any] = Depends(require_user),
):
    """
    Embeds the user query, retrieves top-5 chunks from FAISS,
    and generates a grounded answer with GPT-4o. The exchange is always saved
    against the authenticated user — `user_id` from the request body is now
    ignored (kept in the schema only for backwards-compatible clients).

    Two layers of throttling apply:
      • slowapi: 20 calls/minute per IP — burst protection.
      • quota_service: monthly cap per user, scaled by their subscription tier.
    """
    user_id = int(current_user["id"])
    logger.info(
        "Chat query: '%s' | mode=%s role=%s user_id=%s",
        body.query[:80], body.mode, body.user_role, user_id,
    )

    try:
        quota_service.check_and_increment(user_id, "chat")
    except quota_service.QuotaExceeded as e:
        raise HTTPException(status_code=429, detail=str(e))
    try:
        result = await chat_service.process_query(
            query=body.query,
            mode=body.mode,
            user_role=body.user_role,
            owner_user_id=user_id,
            model=body.model,
        )
        logger.info("Chat success: confidence=%d, chunks=%d", result.confidence, result.retrieved_chunks)
    except HTTPException:
        # Tier / availability errors raised inside process_query already
        # carry the right status + detail -- pass through unchanged.
        raise
    except Exception as exc:
        logger.error("Chat query failed:\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Query error: {exc}") from exc

    session_id_saved: int | None = None
    try:
        sid, err = chat_history_service.resolve_session_id(
            user_id,
            body.session_id,
            body.query,
        )
        if err is None and sid is not None:
            chat_history_service.append_exchange(
                sid,
                body.query,
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


@app.get("/api/models", response_model=ModelsResponse)
async def list_models(current_user: Dict[str, Any] = Depends(require_user)):
    """
    Return the model picker for the signed-in user, filtered by their
    subscription tier and by which provider API keys are configured on
    this server. The frontend stores the result in memory + sessionStorage
    so the picker doesn't flash on every page nav.

    `default` is a server-recommended starting point: the configured
    DEFAULT_MODEL when reachable for this user, else the cheapest
    available model in their tier.
    """
    user_id = int(current_user["id"])
    row = user_service.get_public_user_by_id(user_id)
    tier = str((row or {}).get("subscription_tier") or "free")

    models = model_registry.list_for_user(tier)

    # Compute a sensible default: prefer DEFAULT_MODEL when allowed +
    # available, else the first available model in the user's tier.
    default_id: str | None = None
    default = settings.DEFAULT_MODEL
    if default and model_registry.check_access(default, tier) is None:
        default_id = default
    else:
        fallback = model_registry.fallback_for(tier)
        if fallback is not None:
            default_id = fallback.id

    return ModelsResponse(
        models=[
            ModelInfoResponse(
                id=m.id,
                label=m.label,
                provider=m.provider,
                min_tier=m.min_tier,
                speed_label=m.speed_label,
                description=m.description,
                available=m.available,
                locked_reason=m.locked_reason,
            )
            for m in models
        ],
        default=default_id,
        tier=tier,
    )


@app.post("/api/voice/transcribe")
@limiter.limit("10/minute")
async def voice_transcribe(
    request: Request,
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(require_user),
):
    """
    Transcribe a short audio clip (recorded by the user's mic) into text
    via OpenAI Whisper. Returns `{"text": "..."}` so the frontend can
    drop the result straight into the chat input box for editing.

    Throttling layers:
      • slowapi: 10 calls/minute per IP — burst protection.
      • quota_service: monthly per-user cap by subscription tier.
      • voice_service: 10 MB hard cap on the audio payload, plus
        Content-Length pre-check below.
    """
    # Cheap pre-check based on the request header so a multi-GB upload is
    # rejected before we buffer any of it. The streaming reader inside
    # voice_service still enforces the same cap as a backstop.
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Audio file too large. Maximum allowed is "
                f"{MAX_AUDIO_BYTES // (1024 * 1024)} MB."
            ),
        )

    user_id = int(current_user["id"])

    try:
        quota_service.check_and_increment(user_id, "voice")
    except quota_service.QuotaExceeded as e:
        raise HTTPException(status_code=429, detail=str(e))

    try:
        text = await voice_service.transcribe_audio(file)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        # OPENAI_API_KEY missing / disabled — surface as a 503 so the
        # client can show "voice unavailable" rather than a generic 500.
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.error(
            "Voice transcription failed for user %s:\n%s",
            user_id, traceback.format_exc(),
        )
        raise HTTPException(status_code=500, detail="Transcription failed.") from exc

    return {"text": text}


@app.get("/api/documents/count")
async def chunk_count(current_user: Dict[str, Any] = Depends(require_user)):
    """Return the FAISS chunk count for the signed-in user only."""
    user_id = int(current_user["id"])
    count = await document_service.get_chunk_count(owner_user_id=user_id)
    return {"total_chunks": count, "user_id": user_id, "status": "success"}


@app.get("/api/documents")
async def list_documents(current_user: Dict[str, Any] = Depends(require_user)):
    """List documents owned by the signed-in user. Other users' files are never returned."""
    user_id = int(current_user["id"])
    return {"documents": document_service.list_user_documents(user_id)}


@app.delete("/api/documents/{document_id}")
async def delete_document(
    document_id: str,
    current_user: Dict[str, Any] = Depends(require_user),
):
    """
    Delete a document. The caller must own it; otherwise 403 is returned so
    that one user can never wipe another user's uploads.
    """
    user_id = int(current_user["id"])
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
