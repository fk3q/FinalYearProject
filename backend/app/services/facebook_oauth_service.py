"""
Verify Facebook Login user access tokens and load the user's profile from Graph API.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional, Tuple

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_GRAPH_ME = "https://graph.facebook.com/v21.0/me"
_DEBUG_TOKEN = "https://graph.facebook.com/v21.0/debug_token"


async def verify_facebook_access_token(
    access_token: str,
) -> Tuple[Dict[str, Any], Optional[str]]:
    """
    Returns (profile_dict, error_message). profile has: fb_id, email, first_name, last_name.

    1) debug_token — confirm the token is valid and issued for our app.
    2) /me — load id, email, name parts.
    """
    app_id = (settings.FACEBOOK_APP_ID or "").strip()
    app_secret = (settings.FACEBOOK_APP_SECRET or "").strip()
    if not app_id or not app_secret:
        return {}, "Facebook Login is not configured on the server."

    if not access_token or not isinstance(access_token, str):
        return {}, "Missing Facebook access token."

    app_access = f"{app_id}|{app_secret}"

    async with httpx.AsyncClient(timeout=12.0) as client:
        dbg = await client.get(
            _DEBUG_TOKEN,
            params={
                "input_token": access_token,
                "access_token": app_access,
            },
        )
        try:
            dbg_json = dbg.json()
        except Exception:
            dbg_json = {}

        if dbg.status_code != 200:
            logger.info("Facebook debug_token HTTP %s: %s", dbg.status_code, dbg.text[:200])
            return {}, "Could not verify Facebook session."

        data = dbg_json.get("data") or {}
        if not data.get("is_valid"):
            return {}, "Invalid or expired Facebook session. Please try again."

        if str(data.get("app_id")) != app_id:
            return {}, "Facebook session was not issued for this app."

        me = await client.get(
            _GRAPH_ME,
            params={
                "fields": "id,email,first_name,last_name",
                "access_token": access_token,
            },
        )
        try:
            me_json = me.json()
        except Exception:
            me_json = {}

    if me.status_code != 200:
        logger.info("Facebook /me HTTP %s: %s", me.status_code, str(me_json)[:200])
        return {}, "Could not read your Facebook profile."

    fb_id = str(me_json.get("id") or "").strip()
    if not fb_id:
        return {}, "Facebook did not return a user id."

    email = (me_json.get("email") or "").strip().lower()
    if not email:
        return {}, (
            "Facebook did not share your email. Open Facebook → Settings → "
            "Apps and Websites and allow email for Laboracle, then try again."
        )

    first = (me_json.get("first_name") or "").strip() or "User"
    last = (me_json.get("last_name") or "").strip() or ""

    return (
        {
            "fb_id": fb_id,
            "email": email,
            "first_name": first,
            "last_name": last,
        },
        None,
    )
