"""
Shared FastAPI dependencies.

`require_user` is the single source of truth for user authentication on every
protected endpoint. Routes pull the bearer token out of the `Authorization`
header, look it up in `user_sessions`, and return the matching user row. If
the URL path also contains `{user_id}`, call `require_user_matches` to ensure
the caller is operating on their own account (the previous code trusted
whatever id the client sent — a textbook IDOR bug).
"""

from typing import Any, Dict, Optional

from fastapi import Header, HTTPException, status

from app.services import session_service, user_service


def _extract_bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    auth = authorization.strip()
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip() or None
    return auth or None


def require_user(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    """
    Resolve the bearer token to a user row.

    Returns the public user dict (no password hash). Raises 401 if the token
    is missing, unknown, expired, or refers to a deleted user. Routes that
    accept this dependency MUST treat the returned `id` as authoritative —
    never use a `user_id` taken from the request body or path without
    cross-checking it against this dict.
    """
    token = _extract_bearer(authorization)
    user_id = session_service.get_user_id_for_token(token)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in required.",
            headers={"WWW-Authenticate": 'Bearer realm="laboracle"'},
        )
    row = user_service.get_public_user_by_id(user_id)
    if not row:
        # Token references a user that was deleted out from under us. Revoke
        # the dangling session so it can never be used again.
        session_service.revoke_session(token)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in required.",
            headers={"WWW-Authenticate": 'Bearer realm="laboracle"'},
        )
    return row


def require_user_matches(path_user_id: int, current_user: Dict[str, Any]) -> None:
    """
    Enforce that the URL's `{user_id}` matches the authenticated user.

    Use inside endpoints that have the user id in the path so attackers cannot
    iterate through ids they don't own.
    """
    if int(current_user["id"]) != int(path_user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only access your own account.",
        )


def get_bearer_token(authorization: Optional[str] = Header(default=None)) -> Optional[str]:
    """Expose the raw token for endpoints that need to revoke it (logout)."""
    return _extract_bearer(authorization)
