"""
Registration, login, and user profile (MySQL).
"""

import logging
from typing import Any, Dict, List

import pymysql
from fastapi import APIRouter, HTTPException, Path, Request, Response
from pymysql.err import IntegrityError

from app.models.schemas import (
    AuthSuccessResponse,
    ChatHistoryMessage,
    ChatSessionDetailResponse,
    ChatSessionSummary,
    ForgotPasswordRequest,
    RegisterResponse,
    ResetPasswordRequest,
    SimpleMessageResponse,
    UsageSecondsRequest,
    UserLoginRequest,
    UserProfilePatchRequest,
    UserProfileResponse,
    UserPublic,
    UserRegisterRequest,
)
from app.services import (
    admin_service,
    chat_history_service,
    password_reset_service,
    user_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


def _db_unavailable(exc: Exception) -> HTTPException:
    logger.warning("Database error: %s", exc)
    return HTTPException(
        status_code=503,
        detail="Cannot reach MySQL. Check MYSQL_* settings and that the server is running.",
    )


@router.post("/register", response_model=RegisterResponse, status_code=201)
async def register(body: UserRegisterRequest, request: Request):
    """
    Create a new user. Email is unique; duplicate emails return 409.
    Captures the client IP and (best-effort) country/city for the admin dashboard.
    """
    client_ip = _client_ip_from_request(request)
    country, country_code, city = admin_service.lookup_geo(client_ip)
    try:
        user_id = user_service.create_user(
            email=body.email,
            password=body.password,
            first_name=body.first_name,
            last_name=body.last_name,
            phone=body.phone,
            signup_ip=client_ip,
            signup_country=country,
            signup_country_code=country_code,
            signup_city=city,
        )
    except IntegrityError as e:
        err = str(e).lower()
        if "duplicate" in err or (e.args and e.args[0] == 1062):
            raise HTTPException(status_code=409, detail="An account with this email already exists.")
        raise HTTPException(status_code=400, detail="Could not create account.") from e
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e

    row = user_service.get_public_user_by_id(user_id)
    if not row:
        raise HTTPException(status_code=500, detail="Account created but profile could not be loaded.")
    user = UserPublic(**_normalize_user_row(row))
    return RegisterResponse(message="Account created successfully.", user=user)


def _client_ip_from_request(request: Request) -> str | None:
    """Prefer X-Forwarded-For (set by nginx/Vite proxy) over request.client.host."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        first = fwd.split(",")[0].strip()
        if first:
            return first
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return request.client.host if request.client else None


@router.post("/login", response_model=AuthSuccessResponse)
async def login(body: UserLoginRequest):
    """
    Verify email and password. Returns public profile on success (401 if invalid).
    """
    try:
        row = user_service.verify_login(body.email, body.password)
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e

    if not row:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    user = UserPublic(**_normalize_user_row(row))
    return AuthSuccessResponse(message="Signed in successfully.", user=user)


@router.post("/forgot-password", response_model=SimpleMessageResponse)
async def forgot_password(body: ForgotPasswordRequest):
    """
    Start the password-reset flow. Always returns the same message so we don't
    reveal whether the email has an account.
    """
    try:
        password_reset_service.request_reset(body.email)
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e
    except Exception:
        logger.exception("Forgot-password request failed for %s", body.email)
    return SimpleMessageResponse(
        message="If an account exists for that email, a 6-digit code has been sent."
    )


@router.post("/reset-password", response_model=SimpleMessageResponse)
async def reset_password(body: ResetPasswordRequest):
    """Verify the 6-digit code and set the new password."""
    try:
        password_reset_service.reset_password(body.email, body.code, body.new_password)
    except password_reset_service.ResetError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e
    return SimpleMessageResponse(message="Password updated. You can sign in now.")


def _normalize_user_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure keys match UserPublic (e.g. datetime serialization left to Pydantic)."""
    return {
        "id": int(row["id"]),
        "email": str(row["email"]),
        "first_name": str(row["first_name"]),
        "last_name": str(row["last_name"]),
        "phone": str(row["phone"]),
        "created_at": row.get("created_at"),
        "subscription_tier": str(row.get("subscription_tier") or "free"),
    }


users_router = APIRouter(prefix="/users", tags=["users"])


def _profile_from_service(row: dict) -> UserProfileResponse:
    return UserProfileResponse(
        id=int(row["id"]),
        email=str(row["email"]),
        first_name=str(row["first_name"]),
        last_name=str(row["last_name"]),
        phone=str(row["phone"]),
        created_at=row.get("created_at"),
        profile_picture_url=row.get("profile_picture_url"),
        daily_time_seconds=int(row.get("daily_time_seconds", 0)),
        subscription_tier=str(row.get("subscription_tier") or "free"),
        has_stripe_customer=bool(row.get("has_stripe_customer")),
    )


@users_router.get("/{user_id}/profile", response_model=UserProfileResponse)
async def get_user_profile(user_id: int = Path(..., ge=1)):
    """Full profile for the signed-in user's account page."""
    try:
        row = user_service.get_user_profile_detail(user_id)
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e
    if not row:
        raise HTTPException(status_code=404, detail="User not found.")
    return _profile_from_service(row)


@users_router.patch("/{user_id}/profile", response_model=UserProfileResponse)
async def patch_user_profile(
    body: UserProfilePatchRequest,
    user_id: int = Path(..., ge=1),
):
    try:
        cleaned = user_service.validate_profile_picture_payload(body.profile_picture_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    try:
        ok = user_service.update_profile_picture(user_id, cleaned)
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e
    if not ok:
        raise HTTPException(status_code=404, detail="User not found.")
    row = user_service.get_user_profile_detail(user_id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found.")
    return _profile_from_service(row)


@users_router.post("/{user_id}/usage", status_code=204)
async def add_usage_time(
    body: UsageSecondsRequest,
    user_id: int = Path(..., ge=1),
):
    """Accumulate active time for today (client sends periodic pings while the app is open)."""
    try:
        row = user_service.get_public_user_by_id(user_id)
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e
    if not row:
        raise HTTPException(status_code=404, detail="User not found.")
    try:
        user_service.add_daily_usage_seconds(user_id, body.seconds)
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e
    return Response(status_code=204)


@users_router.get("/{user_id}/chat-sessions", response_model=List[ChatSessionSummary])
async def list_chat_sessions(user_id: int = Path(..., ge=1)):
    """Saved conversations for the chat sidebar."""
    try:
        row = user_service.get_public_user_by_id(user_id)
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e
    if not row:
        raise HTTPException(status_code=404, detail="User not found.")
    try:
        rows = chat_history_service.list_sessions_for_user(user_id)
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e
    return [
        ChatSessionSummary(
            id=int(r["id"]),
            title=str(r["title"]),
            updated_at=r.get("updated_at"),
        )
        for r in rows
    ]


@users_router.get(
    "/{user_id}/chat-sessions/{session_id}",
    response_model=ChatSessionDetailResponse,
)
async def get_chat_session_detail(
    user_id: int = Path(..., ge=1),
    session_id: int = Path(..., ge=1),
):
    try:
        urow = user_service.get_public_user_by_id(user_id)
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e
    if not urow:
        raise HTTPException(status_code=404, detail="User not found.")
    try:
        data = chat_history_service.get_session_messages(user_id, session_id)
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e
    if not data:
        raise HTTPException(status_code=404, detail="Chat not found.")
    msgs = [ChatHistoryMessage(**m) for m in data["messages"]]
    return ChatSessionDetailResponse(
        session_id=data["session_id"],
        title=data["title"],
        created_at=data.get("created_at"),
        updated_at=data.get("updated_at"),
        messages=msgs,
    )


@users_router.delete("/{user_id}/chat-sessions/{session_id}", status_code=204)
async def delete_chat_session(
    user_id: int = Path(..., ge=1),
    session_id: int = Path(..., ge=1),
):
    try:
        urow = user_service.get_public_user_by_id(user_id)
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e
    if not urow:
        raise HTTPException(status_code=404, detail="User not found.")
    try:
        ok = chat_history_service.delete_session(user_id, session_id)
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e
    if not ok:
        raise HTTPException(status_code=404, detail="Chat not found.")
    return Response(status_code=204)


@users_router.get("/{user_id}", response_model=UserPublic)
async def get_user(user_id: int = Path(..., ge=1)):
    """
    Retrieve stored profile for a user by id (no password returned).
    """
    try:
        row = user_service.get_public_user_by_id(user_id)
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e

    if not row:
        raise HTTPException(status_code=404, detail="User not found.")

    return UserPublic(**_normalize_user_row(row))
