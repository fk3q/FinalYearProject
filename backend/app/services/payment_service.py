"""
Stripe payments — checkout sessions, customer portal, and webhook handling.

All writes to `users.subscription_tier` flow through `handle_webhook_event`, so
the database tier can never get out of sync with Stripe's source of truth.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, Optional

import stripe

from app.config import settings
from app.db import mysql_db

logger = logging.getLogger(__name__)

# Stripe SDK reads api_key at call time, so setting it here once is enough.
stripe.api_key = settings.STRIPE_SECRET_KEY or None


def is_configured() -> bool:
    """True when enough env vars are set to actually create a checkout."""
    return bool(
        settings.STRIPE_SECRET_KEY
        and (
            settings.STRIPE_PRICE_REGULAR_MONTHLY
            or settings.STRIPE_PRICE_ADVANCED_MONTHLY
        )
    )


def _price_to_tier_map() -> Dict[str, str]:
    """Reverse lookup: a Stripe price id -> our internal tier name."""
    return {
        settings.STRIPE_PRICE_REGULAR_MONTHLY: "regular",
        settings.STRIPE_PRICE_REGULAR_YEARLY: "regular",
        settings.STRIPE_PRICE_ADVANCED_MONTHLY: "advanced",
        settings.STRIPE_PRICE_ADVANCED_YEARLY: "advanced",
    }


def _resolve_price_id(plan: str, billing: str) -> Optional[str]:
    key = f"STRIPE_PRICE_{plan.upper()}_{billing.upper()}"
    value = getattr(settings, key, "")
    return value or None


def _get_or_create_stripe_customer(user_row: Dict[str, Any]) -> str:
    """Return the Stripe customer id for this user, creating one if needed.

    Two safeguards stop us from ever creating duplicate Stripe customers for
    the same user when checkout requests race:

    1. The Stripe call uses an `idempotency_key` derived from our user id, so
       Stripe will return the same customer object on a retry.
    2. The DB update only writes the customer id if the column is still NULL.
       A losing concurrent caller will see 0 rows updated and re-read the row
       to pick up whichever customer id won.
    """
    existing = user_row.get("stripe_customer_id")
    if existing:
        return existing

    user_id = int(user_row["id"])
    name = f"{user_row.get('first_name', '')} {user_row.get('last_name', '')}".strip()
    customer = stripe.Customer.create(
        email=user_row["email"],
        name=name or None,
        metadata={"user_id": str(user_id)},
        idempotency_key=f"laboracle-customer-{user_id}",
    )

    affected = mysql_db.execute_update(
        """
        UPDATE users
        SET stripe_customer_id = %s
        WHERE id = %s AND stripe_customer_id IS NULL
        """,
        (customer.id, user_id),
    )
    if affected == 0:
        # A concurrent request already attached a customer id; trust that one
        # so we don't end up with two Stripe customers per user in our DB.
        winner = mysql_db.fetch_one(
            "SELECT stripe_customer_id FROM users WHERE id = %s LIMIT 1",
            (user_id,),
        )
        if winner and winner.get("stripe_customer_id"):
            return str(winner["stripe_customer_id"])
    return customer.id


def create_checkout_session(user_id: int, plan: str, billing: str) -> str:
    """
    Build a Stripe-hosted Checkout session and return its URL.
    Caller is responsible for redirecting the browser to that URL.
    """
    if not is_configured():
        raise ValueError(
            "Payments are not configured yet. Set STRIPE_SECRET_KEY and the price IDs "
            "in backend/.env, then rebuild the backend."
        )

    row = mysql_db.fetch_one(
        """
        SELECT id, email, first_name, last_name, stripe_customer_id
        FROM users WHERE id = %s LIMIT 1
        """,
        (user_id,),
    )
    if not row:
        raise ValueError("User not found.")

    price_id = _resolve_price_id(plan, billing)
    if not price_id:
        raise ValueError(f"No Stripe price configured for {plan}/{billing}.")

    customer_id = _get_or_create_stripe_customer(row)

    success_url = f"{settings.FRONTEND_URL}/pay/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{settings.FRONTEND_URL}/pay/cancel"

    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        allow_promotion_codes=True,
        metadata={
            "user_id": str(user_id),
            "plan": plan,
            "billing": billing,
        },
    )

    logger.info(
        "Created checkout session %s for user %s (plan=%s billing=%s)",
        session.id, user_id, plan, billing,
    )
    return session.url


def create_portal_session(user_id: int) -> str:
    """
    Return a URL to the Stripe customer portal so the user can cancel / update
    card / change plan without us having to build any of that UI.
    """
    if not settings.STRIPE_SECRET_KEY:
        raise ValueError("Payments are not configured.")

    row = mysql_db.fetch_one(
        "SELECT stripe_customer_id FROM users WHERE id = %s LIMIT 1",
        (user_id,),
    )
    if not row or not row.get("stripe_customer_id"):
        raise ValueError("No subscription found for this user.")

    portal = stripe.billing_portal.Session.create(
        customer=row["stripe_customer_id"],
        return_url=f"{settings.FRONTEND_URL}/profile",
    )
    return portal.url


# ── Webhook handling ─────────────────────────────────────────────────────────
# Stripe events we care about:
#   checkout.session.completed        — initial purchase; fetch subscription
#   customer.subscription.updated     — plan change, renewal, cancel-at-period-end
#   customer.subscription.deleted     — actually ended, downgrade to free
# Everything else is ignored — we only track tier state, not invoices.


def handle_webhook_event(payload: bytes, sig_header: str) -> str:
    """
    Verify the signed webhook payload and update our DB accordingly.
    Returns the event type that was handled (for logging).
    Raises ValueError on signature mismatch or malformed event.
    """
    if not settings.STRIPE_WEBHOOK_SECRET:
        raise ValueError("STRIPE_WEBHOOK_SECRET is not set; cannot verify webhook.")

    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=sig_header,
            secret=settings.STRIPE_WEBHOOK_SECRET,
        )
    except stripe.error.SignatureVerificationError as e:
        raise ValueError(f"Invalid Stripe signature: {e}") from e
    except ValueError as e:
        raise ValueError(f"Malformed Stripe payload: {e}") from e

    event_type: str = event["type"]
    obj = event["data"]["object"]

    if event_type == "checkout.session.completed":
        _apply_from_checkout_session(obj)
    elif event_type in ("customer.subscription.updated", "customer.subscription.created"):
        _apply_from_subscription(obj)
    elif event_type == "customer.subscription.deleted":
        _downgrade_customer_to_free(obj.get("customer"))
    else:
        logger.debug("Ignoring Stripe event type: %s", event_type)

    return event_type


def _apply_from_checkout_session(session_obj: Dict[str, Any]) -> None:
    """checkout.session.completed gives us session data; fetch the real subscription."""
    sub_id = session_obj.get("subscription")
    if not sub_id:
        logger.warning("checkout.session.completed with no subscription id: %s", session_obj.get("id"))
        return
    try:
        subscription = stripe.Subscription.retrieve(sub_id)
    except stripe.error.StripeError as e:
        logger.exception("Could not retrieve subscription %s: %s", sub_id, e)
        return
    _apply_from_subscription(subscription)


def _apply_from_subscription(subscription: Dict[str, Any]) -> None:
    """
    subscription is a Stripe Subscription object (either live fetch or webhook payload).
    Mirror its active price into users.subscription_tier for the matching customer.
    """
    customer_id = subscription.get("customer")
    if not customer_id:
        logger.warning("Subscription %s has no customer id", subscription.get("id"))
        return

    status = subscription.get("status")
    items = (subscription.get("items") or {}).get("data") or []
    if not items:
        logger.warning("Subscription %s has no items", subscription.get("id"))
        return

    price_id = items[0]["price"]["id"]
    tier = _price_to_tier_map().get(price_id)
    if not tier:
        logger.warning(
            "Subscription %s has unknown price_id %s — cannot map to a tier.",
            subscription.get("id"), price_id,
        )
        return

    # Only 'active' and 'trialing' give access. Anything else (past_due, unpaid,
    # canceled, incomplete, incomplete_expired) → treat as free so we never leave
    # someone on Advanced after a failed charge.
    if status not in ("active", "trialing"):
        _downgrade_customer_to_free(customer_id)
        return

    period_end_ts = subscription.get("current_period_end")
    period_end = datetime.utcfromtimestamp(period_end_ts) if period_end_ts else None

    mysql_db.execute_update(
        """
        UPDATE users
        SET subscription_tier = %s,
            stripe_subscription_id = %s,
            subscription_current_period_end = %s
        WHERE stripe_customer_id = %s
        """,
        (tier, subscription["id"], period_end, customer_id),
    )
    logger.info(
        "Subscription synced: customer=%s tier=%s status=%s",
        customer_id, tier, status,
    )


def _downgrade_customer_to_free(customer_id: Optional[str]) -> None:
    if not customer_id:
        return
    mysql_db.execute_update(
        """
        UPDATE users
        SET subscription_tier = 'free',
            stripe_subscription_id = NULL,
            subscription_current_period_end = NULL
        WHERE stripe_customer_id = %s
        """,
        (customer_id,),
    )
    logger.info("Downgraded customer %s to free tier.", customer_id)
