"""
Cloudflare Turnstile verification.

Sends the token from the signup form to Cloudflare's siteverify endpoint and
returns True only if Cloudflare confirms a real (non-bot) request.

If TURNSTILE_SECRET_KEY is not configured, verification is skipped and treated
as a pass — useful for local dev / running without an internet-exposed Turnstile
account. In production set TURNSTILE_SECRET_KEY in the project root .env.
"""

from __future__ import annotations

import logging
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


async def verify_turnstile_token(
    token: Optional[str],
    *,
    remote_ip: Optional[str] = None,
) -> tuple[bool, Optional[str]]:
    """
    Returns (success, error_message). On success, error_message is None.

    - When TURNSTILE_SECRET_KEY is empty, verification is skipped (returns True).
    - Network errors do NOT block signup (returns True with a warning logged) so
      a Cloudflare outage cannot lock everyone out.
    """
    secret = (settings.TURNSTILE_SECRET_KEY or "").strip()
    if not secret:
        return True, None

    if not token or not isinstance(token, str):
        return False, "Please complete the captcha."

    payload = {"secret": secret, "response": token}
    if remote_ip:
        payload["remoteip"] = remote_ip

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(_VERIFY_URL, data=payload)
            data = resp.json()
    except Exception as exc:
        logger.warning("Turnstile verify request failed (allowing signup): %s", exc)
        return True, None

    if data.get("success") is True:
        return True, None

    codes = data.get("error-codes") or []
    logger.info("Turnstile rejected token (error-codes=%s)", codes)
    return False, "Captcha verification failed. Please try again."
