"""
Password reset via 6-digit email code (MySQL-backed).

Flow:
  1. request_reset(email) — create code, email it, store bcrypt hash.
  2. reset_password(email, code, new_password) — verify code + update password.
"""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

import bcrypt

from app.config import settings
from app.db import mysql_db
from app.services import email_service, user_service

logger = logging.getLogger(__name__)

CODE_TTL_MINUTES = 15
MAX_ATTEMPTS = 5
MIN_PASSWORD_LENGTH = 6


class ResetError(Exception):
    """Domain error for password-reset operations."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _hash_code(code: str) -> str:
    return bcrypt.hashpw(code.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_code(code: str, code_hash: str) -> bool:
    try:
        return bcrypt.checkpw(code.encode("utf-8"), code_hash.encode("utf-8"))
    except ValueError:
        return False


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _invalidate_existing_codes(user_id: int) -> None:
    mysql_db.execute_update(
        "UPDATE password_reset_codes SET used = 1 WHERE user_id = %s AND used = 0",
        (user_id,),
    )


def _store_code(user_id: int, code: str) -> None:
    expires_at = datetime.utcnow() + timedelta(minutes=CODE_TTL_MINUTES)
    conn = mysql_db.get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO password_reset_codes (user_id, code_hash, expires_at)
                VALUES (%s, %s, %s)
                """,
                (user_id, _hash_code(code), expires_at),
            )
        conn.commit()
    finally:
        conn.close()


def _latest_active_code(user_id: int) -> Optional[Dict[str, Any]]:
    return mysql_db.fetch_one(
        """
        SELECT id, code_hash, expires_at, used, attempts
        FROM password_reset_codes
        WHERE user_id = %s AND used = 0
        ORDER BY id DESC
        LIMIT 1
        """,
        (user_id,),
    )


def _mark_used(code_id: int) -> None:
    mysql_db.execute_update(
        "UPDATE password_reset_codes SET used = 1 WHERE id = %s",
        (code_id,),
    )


def _increment_attempts(code_id: int) -> None:
    mysql_db.execute_update(
        "UPDATE password_reset_codes SET attempts = attempts + 1 WHERE id = %s",
        (code_id,),
    )


def _email_code(to_email: str, first_name: str, code: str) -> bool:
    app_name = settings.APP_NAME or "Laboracle"
    subject = f"{app_name} — your password reset code"
    greeting = f"Hi {first_name}," if first_name else "Hi,"
    text = (
        f"{greeting}\n\n"
        f"We received a request to reset your {app_name} password. "
        f"Your 6-digit verification code is:\n\n"
        f"    {code}\n\n"
        f"This code expires in {CODE_TTL_MINUTES} minutes. "
        f"If you didn't request a reset, you can ignore this email.\n\n"
        f"— {app_name}"
    )
    html = (
        f"<p>{greeting}</p>"
        f"<p>We received a request to reset your <strong>{app_name}</strong> password. "
        f"Your 6-digit verification code is:</p>"
        f"<p style=\"font-size:28px;letter-spacing:6px;font-weight:700;margin:16px 0;\">"
        f"{code}</p>"
        f"<p>This code expires in {CODE_TTL_MINUTES} minutes. "
        f"If you didn't request a reset, you can ignore this email.</p>"
        f"<p>— {app_name}</p>"
    )
    return email_service.send_email(to_email, subject, text, html)


def request_reset(email: str) -> None:
    """
    Generate a one-time code and email it. Silently no-ops when the email is
    unknown so we don't leak which addresses have accounts.
    """
    row = user_service.get_user_by_email(email)
    if not row:
        logger.info("Password reset requested for unknown email %s", email)
        return

    user_id = int(row["id"])
    code = _generate_code()
    _invalidate_existing_codes(user_id)
    _store_code(user_id, code)
    delivered = _email_code(str(row["email"]), str(row.get("first_name") or ""), code)
    if not delivered:
        logger.info(
            "Password reset code for user_id=%s (%s) is %s (email delivery skipped — "
            "SMTP not configured or send failed)",
            user_id,
            row["email"],
            code,
        )


def reset_password(email: str, code: str, new_password: str) -> None:
    if not new_password or len(new_password) < MIN_PASSWORD_LENGTH:
        raise ResetError(
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters.",
            status_code=400,
        )
    code = (code or "").strip()
    if len(code) != 6 or not code.isdigit():
        raise ResetError("Enter the 6-digit code from the email.", status_code=400)

    row = user_service.get_user_by_email(email)
    if not row:
        raise ResetError("That email and code don't match.", status_code=400)
    user_id = int(row["id"])

    record = _latest_active_code(user_id)
    if not record:
        raise ResetError(
            "No active code for this email. Request a new one.",
            status_code=400,
        )

    if int(record["attempts"]) >= MAX_ATTEMPTS:
        _mark_used(int(record["id"]))
        raise ResetError(
            "Too many incorrect attempts. Request a new code.",
            status_code=429,
        )

    expires_at = record["expires_at"]
    if isinstance(expires_at, datetime) and expires_at < datetime.utcnow():
        _mark_used(int(record["id"]))
        raise ResetError("This code has expired. Request a new one.", status_code=400)

    if not _verify_code(code, str(record["code_hash"])):
        _increment_attempts(int(record["id"]))
        raise ResetError("That code isn't correct.", status_code=400)

    mysql_db.execute_update(
        "UPDATE users SET password_hash = %s WHERE id = %s",
        (_hash_password(new_password), user_id),
    )
    _mark_used(int(record["id"]))
    logger.info("Password reset succeeded for user_id=%s", user_id)
