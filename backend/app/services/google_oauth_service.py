"""
Verify Google Sign-In ID tokens (JWT) from the frontend.

The React app obtains a credential string via the Google Identity Services
JavaScript library; we verify it server-side with google-auth.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional, Tuple

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.config import settings

logger = logging.getLogger(__name__)


def verify_google_id_token(credential: str) -> Tuple[Dict[str, Any], Optional[str]]:
    """
    Returns (claims_dict, error_message). On success error_message is None.

    Raises nothing — callers translate errors into HTTP responses.
    """
    client_id = (settings.GOOGLE_OAUTH_CLIENT_ID or "").strip()
    if not client_id:
        return {}, "Google Sign-In is not configured on the server."

    if not credential or not isinstance(credential, str):
        return {}, "Missing Google credential."

    try:
        req = google_requests.Request()
        info = id_token.verify_oauth2_token(credential, req, audience=client_id)
    except ValueError as exc:
        logger.info("Google ID token rejected: %s", exc)
        return {}, "Invalid Google sign-in. Please try again."

    if not info.get("email_verified", False):
        return {}, "Your Google email is not verified. Please verify it in Google, then try again."

    email = (info.get("email") or "").strip().lower()
    if not email:
        return {}, "Google did not return an email address."

    sub = str(info.get("sub") or "").strip()
    if not sub:
        return {}, "Invalid Google account identifier."

    given = (info.get("given_name") or "").strip() or "User"
    family = (info.get("family_name") or "").strip() or ""

    claims = {
        "sub": sub,
        "email": email,
        "given_name": given,
        "family_name": family,
        "picture": info.get("picture"),
    }
    return claims, None
