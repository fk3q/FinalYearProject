"""
Per-tier monthly quotas for chat queries and document uploads.

Each tier has a hard cap on how many of each action a user can perform per
calendar month. Counters live in `user_quota_usage`, keyed by
`(user_id, period_start)` where `period_start` is the first day of the
current month — that way we never accidentally roll across month boundaries.

`advanced` is uncapped, so we don't even hit the DB for those users.
"""

import logging
from datetime import date
from typing import Any, Dict, Optional

from app.db import mysql_db
from app.services import user_service

logger = logging.getLogger(__name__)


# Tier → {chat: monthly limit, upload: monthly limit}. None = unlimited.
QUOTAS: Dict[str, Dict[str, Optional[int]]] = {
    "free":     {"chat": 30,  "upload": 5},
    "regular":  {"chat": 300, "upload": 50},
    "advanced": {"chat": None, "upload": None},
}


class QuotaExceeded(Exception):
    """Raised when the user has hit their monthly limit for an action."""

    def __init__(self, action: str, tier: str, limit: int, used: int):
        super().__init__(
            f"Monthly {action} limit reached "
            f"({used}/{limit} for {tier} plan). Upgrade to keep going."
        )
        self.action = action
        self.tier = tier
        self.limit = limit
        self.used = used


def _period_start_today() -> date:
    """First day of the current month — used as the row key in user_quota_usage."""
    today = date.today()
    return today.replace(day=1)


def _tier_for(user_id: int) -> str:
    row = user_service.get_public_user_by_id(user_id)
    return str((row or {}).get("subscription_tier") or "free")


def _current_counts(user_id: int) -> Dict[str, int]:
    row = mysql_db.fetch_one(
        """
        SELECT chat_count, upload_count
        FROM user_quota_usage
        WHERE user_id = %s AND period_start = %s
        LIMIT 1
        """,
        (int(user_id), _period_start_today()),
    )
    return {
        "chat": int((row or {}).get("chat_count") or 0),
        "upload": int((row or {}).get("upload_count") or 0),
    }


def _bump(user_id: int, *, chat_delta: int = 0, upload_delta: int = 0) -> None:
    """Atomic upsert: insert a new month row or add to the existing counters."""
    mysql_db.execute_update(
        """
        INSERT INTO user_quota_usage (user_id, period_start, chat_count, upload_count)
        VALUES (%s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            chat_count   = chat_count   + VALUES(chat_count),
            upload_count = upload_count + VALUES(upload_count)
        """,
        (
            int(user_id),
            _period_start_today(),
            max(0, int(chat_delta)),
            max(0, int(upload_delta)),
        ),
    )


def check_and_increment(user_id: int, action: str) -> None:
    """
    Reserve one unit of `action` ('chat' or 'upload') for the user, or raise
    `QuotaExceeded` if their tier is already at the cap for this month.
    """
    if action not in ("chat", "upload"):
        raise ValueError(f"Unknown quota action: {action!r}")

    tier = _tier_for(user_id)
    limit = QUOTAS.get(tier, QUOTAS["free"]).get(action)
    if limit is None:
        # Advanced (or any future uncapped tier) — still increment for analytics.
        _bump(user_id, **{f"{action}_delta": 1})
        return

    counts = _current_counts(user_id)
    used = counts[action]
    if used >= limit:
        raise QuotaExceeded(action=action, tier=tier, limit=limit, used=used)

    # Slight race: two calls could both pass the check and end up at limit+1.
    # We accept that — the +1 overshoot is harmless and easier than a SELECT
    # FOR UPDATE transaction across two writes per call.
    _bump(user_id, **{f"{action}_delta": 1})


def get_usage(user_id: int) -> Dict[str, Any]:
    """Snapshot for the profile page or admin tools."""
    tier = _tier_for(user_id)
    limits = QUOTAS.get(tier, QUOTAS["free"])
    counts = _current_counts(user_id)
    return {
        "tier": tier,
        "period_start": _period_start_today().isoformat(),
        "chat":   {"used": counts["chat"],   "limit": limits["chat"]},
        "upload": {"used": counts["upload"], "limit": limits["upload"]},
    }
