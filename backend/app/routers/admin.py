"""
Admin dashboard routes — separate login (hardcoded creds in env) and stats
endpoints protected by an in-memory bearer token.
"""

import logging

import pymysql
from fastapi import APIRouter, Depends, Header, HTTPException

from app.models.schemas import (
    AdminBackfillResponse,
    AdminLoginRequest,
    AdminLoginResponse,
    AdminStatsResponse,
    AdminUsersResponse,
    SimpleMessageResponse,
)
from app.services import admin_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


def _db_unavailable(exc: Exception) -> HTTPException:
    logger.warning("Admin DB error: %s", exc)
    return HTTPException(
        status_code=503,
        detail="Cannot reach MySQL. Check MYSQL_* settings and that the server is running.",
    )


def _extract_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    if authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1].strip() or None
    return authorization.strip() or None


def require_admin(authorization: str | None = Header(default=None)) -> str:
    """Dependency: 401 if the bearer token is missing or expired."""
    token = _extract_token(authorization)
    if not admin_service.is_token_valid(token):
        raise HTTPException(status_code=401, detail="Admin authentication required.")
    return token  # type: ignore[return-value]


@router.post("/login", response_model=AdminLoginResponse)
async def admin_login(body: AdminLoginRequest):
    sess = admin_service.authenticate(body.username, body.password)
    if not sess:
        raise HTTPException(status_code=401, detail="Invalid admin credentials.")
    return AdminLoginResponse(token=sess.token, expires_at=sess.expires_at)


@router.post("/logout", response_model=SimpleMessageResponse)
async def admin_logout(token: str = Depends(require_admin)):
    admin_service.revoke_token(token)
    return SimpleMessageResponse(message="Signed out.")


@router.get("/stats", response_model=AdminStatsResponse)
async def admin_stats(_: str = Depends(require_admin)):
    try:
        data = admin_service.get_dashboard_stats()
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e
    return AdminStatsResponse(**data)


@router.get("/users", response_model=AdminUsersResponse)
async def admin_users(_: str = Depends(require_admin)):
    """Comprehensive per-user breakdown — personal details, usage, and uploads."""
    try:
        data = admin_service.get_all_users_detailed()
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e
    return AdminUsersResponse(**data)


@router.post("/backfill-geo", response_model=AdminBackfillResponse)
async def admin_backfill_geo(_: str = Depends(require_admin)):
    """One-shot helper: fill country/city for users whose signup_ip was captured but geo wasn't."""
    try:
        updated = admin_service.backfill_missing_geo()
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e
    return AdminBackfillResponse(updated=updated)
