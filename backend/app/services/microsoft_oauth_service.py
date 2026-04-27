"""
Verify Microsoft Identity Platform ID tokens (JWT) from MSAL.js on the frontend.

We register the app against the multi-tenant `common` authority so a single
button covers personal Microsoft accounts (@outlook.com, @hotmail.com,
@live.com) and any work/school account that lives in Microsoft Entra ID
(formerly Azure AD) — including most universities that issue M365 mail.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional, Tuple

import jwt
from jwt import PyJWKClient

from app.config import settings

logger = logging.getLogger(__name__)

_JWKS_URL = "https://login.microsoftonline.com/common/discovery/v2.0/keys"

_jwks_client = PyJWKClient(_JWKS_URL, cache_keys=True, lifespan=3600)

_TENANT_PERSONAL = "9188040d-6c67-4c5b-b112-36a304b66dad"


def verify_microsoft_id_token(id_token: str) -> Tuple[Dict[str, Any], Optional[str]]:
    """
    Returns (claims_dict, error_message). On success error_message is None.

    Verifies signature against Microsoft's published JWKS, audience against
    the configured client id, expiry, and issuer (must come from
    `login.microsoftonline.com/<tenantId>/v2.0`).
    """
    client_id = (settings.MICROSOFT_CLIENT_ID or "").strip()
    if not client_id:
        return {}, "Microsoft Sign-In is not configured on the server."

    if not id_token or not isinstance(id_token, str):
        return {}, "Missing Microsoft ID token."

    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(id_token)
        decoded = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=client_id,
            options={"verify_iss": False},
        )
    except jwt.ExpiredSignatureError:
        return {}, "Microsoft sign-in expired. Please try again."
    except jwt.InvalidAudienceError:
        return {}, "Microsoft session was not issued for this app."
    except jwt.InvalidTokenError as exc:
        logger.info("Microsoft ID token rejected: %s", exc)
        return {}, "Invalid Microsoft sign-in. Please try again."
    except Exception:
        logger.exception("Microsoft ID token verification failed")
        return {}, "Could not verify Microsoft session."

    iss = str(decoded.get("iss") or "")
    if not (iss.startswith("https://login.microsoftonline.com/") and iss.endswith("/v2.0")):
        return {}, "Invalid Microsoft issuer."

    sub = str(decoded.get("oid") or decoded.get("sub") or "").strip()
    if not sub:
        return {}, "Invalid Microsoft account identifier."

    email = (decoded.get("email") or decoded.get("preferred_username") or "").strip().lower()
    if not email or "@" not in email:
        return {}, (
            "Microsoft did not share your email. Open your Microsoft account "
            "permissions for Laboracle and allow email, then try again."
        )

    given = (decoded.get("given_name") or "").strip()
    family = (decoded.get("family_name") or "").strip()
    if not given and not family:
        full = (decoded.get("name") or "").strip()
        if full:
            parts = full.split(" ", 1)
            given = parts[0]
            family = parts[1] if len(parts) > 1 else ""

    given = given or "User"

    claims = {
        "sub": sub,
        "email": email,
        "given_name": given,
        "family_name": family,
        "tenant_id": str(decoded.get("tid") or ""),
        "is_personal_account": str(decoded.get("tid") or "") == _TENANT_PERSONAL,
    }
    return claims, None
