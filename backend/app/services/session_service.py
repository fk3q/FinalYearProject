"""
User session tokens — opaque random strings persisted in `user_sessions`.

Replaces the old "trust user_id from the request body" model with a real
bearer-token scheme:

  POST /api/auth/login   →  { user, token, expires_at }
  Authorization: Bearer <token> on every subsequent protected call.

Tokens are single-use opaque values (43 chars from `secrets.token_urlsafe(32)`);
the server stores them as-is and looks them up by primary key. Sessions live
for SESSION_TTL_DAYS, refreshed on each successful login.
"""

import logging
import secrets
from datetime import datetime, timedelta
from typing import Optional, Tuple

from app.db import mysql_db

logger = logging.getLogger(__name__)

# Sessions live for a week. After that the user has to sign in again — no
# sliding renewal because keeping it short on the server limits the blast
# radius of a leaked token (XSS, dev console copy, etc.).
SESSION_TTL_DAYS = 7


def issue_session(user_id: int) -> Tuple[str, datetime]:
    """Mint a fresh session and return (token, expires_at)."""
    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(days=SESSION_TTL_DAYS)
    mysql_db.execute_insert(
        "INSERT INTO user_sessions (token, user_id, expires_at) VALUES (%s, %s, %s)",
        (token, int(user_id), expires),
    )
    return token, expires


def get_user_id_for_token(token: Optional[str]) -> Optional[int]:
    """
    Return the user_id behind a bearer token, or None if it's missing,
    unknown, or expired. Expired rows are deleted opportunistically.
    """
    if not token:
        return None
    row = mysql_db.fetch_one(
        "SELECT user_id, expires_at FROM user_sessions WHERE token = %s LIMIT 1",
        (token,),
    )
    if not row:
        return None
    if row["expires_at"] < datetime.utcnow():
        try:
            mysql_db.execute_update(
                "DELETE FROM user_sessions WHERE token = %s",
                (token,),
            )
        except Exception:
            logger.debug("Session expiry cleanup failed", exc_info=True)
        return None
    # Best-effort touch of last_used_at; never block a request on this.
    try:
        mysql_db.execute_update(
            "UPDATE user_sessions SET last_used_at = %s WHERE token = %s",
            (datetime.utcnow(), token),
        )
    except Exception:
        logger.debug("Session last_used_at update failed", exc_info=True)
    return int(row["user_id"])


def revoke_session(token: Optional[str]) -> None:
    if not token:
        return
    try:
        mysql_db.execute_update(
            "DELETE FROM user_sessions WHERE token = %s",
            (token,),
        )
    except Exception:
        logger.debug("Session revoke failed", exc_info=True)


def revoke_all_for_user(user_id: int) -> int:
    """Force a sign-out on every device for a user (e.g. after password reset)."""
    return mysql_db.execute_update(
        "DELETE FROM user_sessions WHERE user_id = %s",
        (int(user_id),),
    )


def cleanup_expired() -> int:
    """Periodic cleanup hook (not currently scheduled, but cheap to call)."""
    try:
        return mysql_db.execute_update(
            "DELETE FROM user_sessions WHERE expires_at < %s",
            (datetime.utcnow(),),
        )
    except Exception:
        logger.debug("Session cleanup failed", exc_info=True)
        return 0
