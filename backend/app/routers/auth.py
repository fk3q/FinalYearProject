"""
Registration, login, and user profile (MySQL).
"""

import logging
from typing import Any, Dict, List, Optional

import pymysql
from fastapi import APIRouter, Depends, HTTPException, Path, Request, Response
from pymysql.err import IntegrityError
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.dependencies import get_bearer_token, require_user, require_user_matches
from app.models.schemas import (
    AuthSuccessResponse,
    ChatHistoryMessage,
    ChatSessionDetailResponse,
    ChatSessionSummary,
    FacebookSignInRequest,
    ForgotPasswordRequest,
    GoogleSignInRequest,
    MicrosoftSignInRequest,
    QuotaCounter,
    RegisterResponse,
    ResetPasswordRequest,
    SimpleMessageResponse,
    UsageQuotaResponse,
    UsageSecondsRequest,
    UserLoginRequest,
    UserProfilePatchRequest,
    UserProfileResponse,
    UserPublic,
    UserRegisterRequest,
)
from app.services import (
    admin_service,
    captcha_service,
    chat_history_service,
    facebook_oauth_service,
    google_oauth_service,
    microsoft_oauth_service,
    password_reset_service,
    quota_service,
    session_service,
    user_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# Per-IP throttle for unauthenticated endpoints. Stops password-spraying and
# password-reset enumeration. Routes opt in via the @limiter.limit decorator.
limiter = Limiter(key_func=get_remote_address, default_limits=[])


def _db_unavailable(exc: Exception) -> HTTPException:
    logger.warning("Database error: %s", exc)
    return HTTPException(
        status_code=503,
        detail="Cannot reach MySQL. Check MYSQL_* settings and that the server is running.",
    )


@router.post("/register", response_model=RegisterResponse, status_code=201)
@limiter.limit("5/minute")
async def register(request: Request, body: UserRegisterRequest):
    """
    Create a new user. Email is unique; duplicate emails return 409.
    Captures the client IP and (best-effort) country/city for the admin dashboard.
    """
    client_ip = _client_ip_from_request(request)

    captcha_ok, captcha_err = await captcha_service.verify_turnstile_token(
        body.turnstile_token, remote_ip=client_ip
    )
    if not captcha_ok:
        raise HTTPException(status_code=400, detail=captcha_err or "Captcha failed.")

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
    token, expires = session_service.issue_session(user_id)
    return RegisterResponse(
        message="Account created successfully.",
        user=user,
        token=token,
        expires_at=expires,
    )


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
@limiter.limit("8/minute")
async def login(request: Request, body: UserLoginRequest):
    """
    Verify email and password. Returns public profile on success (401 if invalid).

    Throttled to 8 attempts/minute per IP so an attacker can't brute-force
    weak passwords by hammering the endpoint.
    """
    try:
        row = user_service.verify_login(body.email, body.password)
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e

    if not row:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    user = UserPublic(**_normalize_user_row(row))
    token, expires = session_service.issue_session(int(row["id"]))
    return AuthSuccessResponse(
        message="Signed in successfully.",
        user=user,
        token=token,
        expires_at=expires,
    )


@router.post("/google", response_model=AuthSuccessResponse)
async def google_sign_in(body: GoogleSignInRequest, request: Request):
    """
    Sign in or register via Google. Verifies the ID token server-side.

    If an account with the same email already exists with a password, returns 409
    so the user signs in with email/password (we do not auto-link without proof
    of password ownership).
    """
    claims, err = google_oauth_service.verify_google_id_token(body.credential)
    if err:
        raise HTTPException(status_code=400, detail=err)

    client_ip = _client_ip_from_request(request)
    country, country_code, city = admin_service.lookup_geo(client_ip)

    try:
        user_id = user_service.upsert_google_user(
            google_sub=claims["sub"],
            email=claims["email"],
            first_name=claims["given_name"],
            last_name=claims["family_name"],
            signup_ip=client_ip,
            signup_country=country,
            signup_country_code=country_code,
            signup_city=city,
        )
    except ValueError as e:
        code = str(e)
        if code == "email_password_exists":
            raise HTTPException(
                status_code=409,
                detail="An account with this email already exists. Sign in with your password, or use a different Google account.",
            ) from e
        if code == "google_account_mismatch":
            raise HTTPException(
                status_code=409,
                detail="This email is already linked to a different Google account.",
            ) from e
        if code == "facebook_account_exists":
            raise HTTPException(
                status_code=409,
                detail="This email is already registered with Facebook. Use Facebook sign-in.",
            ) from e
        if code == "microsoft_account_exists":
            raise HTTPException(
                status_code=409,
                detail="This email is already registered with Microsoft. Use Microsoft sign-in.",
            ) from e
        raise HTTPException(status_code=400, detail="Could not sign in with Google.") from e
    except IntegrityError as e:
        err = str(e).lower()
        if "duplicate" in err or (e.args and e.args[0] == 1062):
            raise HTTPException(
                status_code=409,
                detail="This Google account or email is already in use.",
            ) from e
        raise HTTPException(status_code=400, detail="Could not create account.") from e
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e

    user_service.update_signup_geo(
        user_id, country=country, country_code=country_code, city=city
    )

    row = user_service.get_public_user_by_id(user_id)
    if not row:
        raise HTTPException(status_code=500, detail="Signed in but profile could not be loaded.")
    user = UserPublic(**_normalize_user_row(row))
    token, expires = session_service.issue_session(user_id)
    return AuthSuccessResponse(
        message="Signed in with Google.",
        user=user,
        token=token,
        expires_at=expires,
    )


@router.post("/facebook", response_model=AuthSuccessResponse)
async def facebook_sign_in(body: FacebookSignInRequest, request: Request):
    """Sign in or register via Facebook (access token from the JS SDK)."""
    profile, err = await facebook_oauth_service.verify_facebook_access_token(body.access_token)
    if err:
        raise HTTPException(status_code=400, detail=err)

    client_ip = _client_ip_from_request(request)
    country, country_code, city = admin_service.lookup_geo(client_ip)

    try:
        user_id = user_service.upsert_facebook_user(
            facebook_id=profile["fb_id"],
            email=profile["email"],
            first_name=profile["first_name"],
            last_name=profile["last_name"],
            signup_ip=client_ip,
            signup_country=country,
            signup_country_code=country_code,
            signup_city=city,
        )
    except ValueError as e:
        code = str(e)
        if code == "email_password_exists":
            raise HTTPException(
                status_code=409,
                detail="An account with this email already exists. Sign in with your password.",
            ) from e
        if code == "facebook_account_mismatch":
            raise HTTPException(
                status_code=409,
                detail="This email is already linked to a different Facebook account.",
            ) from e
        if code == "google_account_exists":
            raise HTTPException(
                status_code=409,
                detail="This email is already registered with Google. Use Google sign-in.",
            ) from e
        if code == "microsoft_account_exists":
            raise HTTPException(
                status_code=409,
                detail="This email is already registered with Microsoft. Use Microsoft sign-in.",
            ) from e
        raise HTTPException(status_code=400, detail="Could not sign in with Facebook.") from e
    except IntegrityError as e:
        err = str(e).lower()
        if "duplicate" in err or (e.args and e.args[0] == 1062):
            raise HTTPException(
                status_code=409,
                detail="This Facebook account or email is already in use.",
            ) from e
        raise HTTPException(status_code=400, detail="Could not create account.") from e
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e

    user_service.update_signup_geo(
        user_id, country=country, country_code=country_code, city=city
    )

    row = user_service.get_public_user_by_id(user_id)
    if not row:
        raise HTTPException(status_code=500, detail="Signed in but profile could not be loaded.")
    user = UserPublic(**_normalize_user_row(row))
    token, expires = session_service.issue_session(user_id)
    return AuthSuccessResponse(
        message="Signed in with Facebook.",
        user=user,
        token=token,
        expires_at=expires,
    )


@router.post("/microsoft", response_model=AuthSuccessResponse)
async def microsoft_sign_in(body: MicrosoftSignInRequest, request: Request):
    """Sign in or register via Microsoft Entra ID (ID token from MSAL.js)."""
    claims, err = microsoft_oauth_service.verify_microsoft_id_token(body.id_token)
    if err:
        raise HTTPException(status_code=400, detail=err)

    client_ip = _client_ip_from_request(request)
    country, country_code, city = admin_service.lookup_geo(client_ip)

    try:
        user_id = user_service.upsert_microsoft_user(
            microsoft_sub=claims["sub"],
            email=claims["email"],
            first_name=claims["given_name"],
            last_name=claims["family_name"],
            signup_ip=client_ip,
            signup_country=country,
            signup_country_code=country_code,
            signup_city=city,
        )
    except ValueError as e:
        code = str(e)
        if code == "email_password_exists":
            raise HTTPException(
                status_code=409,
                detail="An account with this email already exists. Sign in with your password.",
            ) from e
        if code == "microsoft_account_mismatch":
            raise HTTPException(
                status_code=409,
                detail="This email is already linked to a different Microsoft account.",
            ) from e
        if code == "google_account_exists":
            raise HTTPException(
                status_code=409,
                detail="This email is already registered with Google. Use Google sign-in.",
            ) from e
        if code == "facebook_account_exists":
            raise HTTPException(
                status_code=409,
                detail="This email is already registered with Facebook. Use Facebook sign-in.",
            ) from e
        raise HTTPException(status_code=400, detail="Could not sign in with Microsoft.") from e
    except IntegrityError as e:
        err = str(e).lower()
        if "duplicate" in err or (e.args and e.args[0] == 1062):
            raise HTTPException(
                status_code=409,
                detail="This Microsoft account or email is already in use.",
            ) from e
        raise HTTPException(status_code=400, detail="Could not create account.") from e
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e

    user_service.update_signup_geo(
        user_id, country=country, country_code=country_code, city=city
    )

    row = user_service.get_public_user_by_id(user_id)
    if not row:
        raise HTTPException(status_code=500, detail="Signed in but profile could not be loaded.")
    user = UserPublic(**_normalize_user_row(row))
    token, expires = session_service.issue_session(user_id)
    return AuthSuccessResponse(
        message="Signed in with Microsoft.",
        user=user,
        token=token,
        expires_at=expires,
    )


@router.post("/forgot-password", response_model=SimpleMessageResponse)
@limiter.limit("3/minute")
async def forgot_password(request: Request, body: ForgotPasswordRequest):
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
@limiter.limit("5/minute")
async def reset_password(request: Request, body: ResetPasswordRequest):
    """Verify the 6-digit code and set the new password.

    On success, every other active session for this user is revoked so a
    stolen token from before the reset can no longer be used.
    """
    try:
        password_reset_service.reset_password(body.email, body.code, body.new_password)
    except password_reset_service.ResetError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e
    # Best-effort: invalidate any tokens issued before the reset.
    row = user_service.get_user_by_email(body.email)
    if row:
        try:
            session_service.revoke_all_for_user(int(row["id"]))
        except Exception:
            logger.exception("Could not revoke sessions after password reset")
    return SimpleMessageResponse(message="Password updated. You can sign in now.")


@router.post("/logout", response_model=SimpleMessageResponse)
async def logout(token: Optional[str] = Depends(get_bearer_token)):
    """Revoke the current bearer token. Safe to call without one (no-op)."""
    session_service.revoke_session(token)
    return SimpleMessageResponse(message="Signed out.")


def _normalize_user_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure keys match UserPublic (e.g. datetime serialization left to Pydantic)."""
    pic = row.get("profile_picture_data")
    profile_picture_url = str(pic) if pic else None
    return {
        "id": int(row["id"]),
        "email": str(row["email"]),
        "first_name": str(row["first_name"]),
        "last_name": str(row["last_name"]),
        "phone": str(row["phone"]),
        "created_at": row.get("created_at"),
        "subscription_tier": str(row.get("subscription_tier") or "free"),
        "theme": str(row.get("theme") or "light"),
        "profile_picture_url": profile_picture_url,
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
        theme=str(row.get("theme") or "light"),
    )


@users_router.get("/{user_id}/profile", response_model=UserProfileResponse)
async def get_user_profile(
    user_id: int = Path(..., ge=1),
    current_user: Dict[str, Any] = Depends(require_user),
):
    """Full profile for the signed-in user's account page."""
    require_user_matches(user_id, current_user)
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
    current_user: Dict[str, Any] = Depends(require_user),
):
    require_user_matches(user_id, current_user)
    # Profile picture is updated only if the field is explicitly present in the
    # body (Pydantic gives `None` for both "missing" and "explicit null"; we use
    # model_fields_set to tell them apart so a theme-only PATCH doesn't wipe the
    # picture).
    fields_sent = body.model_fields_set
    user_found = True

    if "profile_picture_url" in fields_sent:
        try:
            cleaned = user_service.validate_profile_picture_payload(body.profile_picture_url)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        try:
            user_found = user_service.update_profile_picture(user_id, cleaned)
        except pymysql.err.OperationalError as e:
            raise _db_unavailable(e) from e
        if not user_found:
            raise HTTPException(status_code=404, detail="User not found.")

    if "theme" in fields_sent and body.theme is not None:
        try:
            user_found = user_service.update_user_theme(user_id, body.theme)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except pymysql.err.OperationalError as e:
            raise _db_unavailable(e) from e
        if not user_found:
            raise HTTPException(status_code=404, detail="User not found.")

    row = user_service.get_user_profile_detail(user_id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found.")
    return _profile_from_service(row)


@users_router.get("/{user_id}/usage-quota", response_model=UsageQuotaResponse)
async def get_usage_quota(
    user_id: int = Path(..., ge=1),
    current_user: Dict[str, Any] = Depends(require_user),
):
    """
    Current calendar-month chat/upload counters and tier limits for the user.
    Powers the "Usage this month" panel on the profile page.
    """
    require_user_matches(user_id, current_user)
    try:
        snapshot = quota_service.get_usage(user_id)
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e
    return UsageQuotaResponse(
        tier=snapshot["tier"],
        period_start=snapshot["period_start"],
        chat=QuotaCounter(**snapshot["chat"]),
        upload=QuotaCounter(**snapshot["upload"]),
        voice=QuotaCounter(**snapshot["voice"]),
    )


@users_router.post("/{user_id}/usage", status_code=204)
async def add_usage_time(
    body: UsageSecondsRequest,
    user_id: int = Path(..., ge=1),
    current_user: Dict[str, Any] = Depends(require_user),
):
    """Accumulate active time for today (client sends periodic pings while the app is open)."""
    require_user_matches(user_id, current_user)
    try:
        user_service.add_daily_usage_seconds(user_id, body.seconds)
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e
    return Response(status_code=204)


@users_router.get("/{user_id}/chat-sessions", response_model=List[ChatSessionSummary])
async def list_chat_sessions(
    user_id: int = Path(..., ge=1),
    current_user: Dict[str, Any] = Depends(require_user),
):
    """Saved conversations for the chat sidebar."""
    require_user_matches(user_id, current_user)
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
    current_user: Dict[str, Any] = Depends(require_user),
):
    require_user_matches(user_id, current_user)
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
    current_user: Dict[str, Any] = Depends(require_user),
):
    require_user_matches(user_id, current_user)
    try:
        ok = chat_history_service.delete_session(user_id, session_id)
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e
    if not ok:
        raise HTTPException(status_code=404, detail="Chat not found.")
    return Response(status_code=204)


@users_router.get("/{user_id}", response_model=UserPublic)
async def get_user(
    user_id: int = Path(..., ge=1),
    current_user: Dict[str, Any] = Depends(require_user),
):
    """
    Retrieve stored profile for a user by id (no password returned).

    Now also requires the caller to BE the user — anyone trying to enumerate
    other accounts is rejected with 403 by `require_user_matches`.
    """
    require_user_matches(user_id, current_user)
    try:
        row = user_service.get_public_user_by_id(user_id)
    except pymysql.err.OperationalError as e:
        raise _db_unavailable(e) from e

    if not row:
        raise HTTPException(status_code=404, detail="User not found.")

    return UserPublic(**_normalize_user_row(row))
