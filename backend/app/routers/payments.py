"""
Payment routes — Stripe Checkout, customer portal, and webhook.

Security note: the webhook endpoint intentionally does NOT require a user_id.
It's called by Stripe server-to-server and is authenticated by the signed
`Stripe-Signature` header (verified inside payment_service).
"""

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.services import payment_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["payments"])


class CheckoutRequest(BaseModel):
    user_id: int = Field(..., ge=1)
    plan: Literal["regular", "advanced"]
    billing: Literal["monthly", "yearly"] = "monthly"


class CheckoutResponse(BaseModel):
    url: str


class PortalRequest(BaseModel):
    user_id: int = Field(..., ge=1)


class PortalResponse(BaseModel):
    url: str


@router.post("/create-checkout-session", response_model=CheckoutResponse)
async def create_checkout(body: CheckoutRequest):
    try:
        url = payment_service.create_checkout_session(
            user_id=body.user_id,
            plan=body.plan,
            billing=body.billing,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception("create_checkout_session failed")
        raise HTTPException(status_code=500, detail=f"Checkout error: {e}") from e
    return CheckoutResponse(url=url)


@router.post("/create-portal-session", response_model=PortalResponse)
async def create_portal(body: PortalRequest):
    try:
        url = payment_service.create_portal_session(user_id=body.user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception("create_portal_session failed")
        raise HTTPException(status_code=500, detail=f"Portal error: {e}") from e
    return PortalResponse(url=url)


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """
    Stripe calls this after every payment event. We verify the signature, then
    update users.subscription_tier accordingly. Returns 200 quickly so Stripe
    does not retry.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    try:
        event_type = payment_service.handle_webhook_event(payload, sig_header)
    except ValueError as e:
        logger.warning("Stripe webhook rejected: %s", e)
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception("Stripe webhook handler crashed")
        # Returning 500 tells Stripe to retry; that's what we want on transient DB errors.
        raise HTTPException(status_code=500, detail=f"Webhook handler error: {e}") from e
    return {"received": True, "event": event_type}
