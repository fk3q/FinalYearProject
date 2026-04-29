"""
In-app notification helpers.

Owns the ``notifications`` and ``notification_preferences`` tables.
Two write paths feed this service:

  1. The bi-weekly reminder scheduler (``reminder_scheduler.py``) calls
     :func:`create_for_user` to drop a study or upgrade prompt into a
     user's bell-icon dropdown.
  2. Future code (e.g. quota-exhausted warnings, payment receipts) can
     reuse :func:`create_for_user` without knowing anything about the
     reminder cadence.

Read path: the chat-page bell icon polls :func:`unread_count` on a
short interval and opens a dropdown that calls :func:`list_for_user`.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.db import mysql_db

logger = logging.getLogger(__name__)


# Stable kind strings -- referenced by the scheduler and the email
# templates. Keep these in sync with NOTIFICATION_KIND on the frontend
# so the bell dropdown can pick the right icon for each row.
KIND_STUDY_REMINDER = "study_reminder"
KIND_UPGRADE_REMINDER = "upgrade_reminder"
KIND_SYSTEM = "system"


# ── Default preferences (used when a user has never touched the
# notification settings page). All channels on -- legally we already
# have consent on signup, and the user can opt out per channel from
# Settings any time.
DEFAULT_PREFERENCES: Dict[str, bool] = {
    "study_email_enabled":   True,
    "study_inapp_enabled":   True,
    "upgrade_email_enabled": True,
    "upgrade_inapp_enabled": True,
}


# ──────────────────────────────────────────────────────────────────
#  Notification CRUD
# ──────────────────────────────────────────────────────────────────

def create_for_user(
    user_id: int,
    kind: str,
    title: str,
    body: str,
    link_url: Optional[str] = None,
) -> int:
    """
    Insert a new notification row and return its id. Caller is
    responsible for honouring the user's preferences -- this function
    blindly writes whatever it's told to write.
    """
    new_id = mysql_db.execute_insert(
        """
        INSERT INTO notifications (user_id, kind, title, body, link_url)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (int(user_id), kind, title, body, link_url),
    )
    logger.info(
        "notification created id=%s user_id=%s kind=%s",
        new_id, user_id, kind,
    )
    return new_id


def list_for_user(user_id: int, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Most recent notifications first. ``limit`` is hard-capped at 50
    to keep the bell dropdown payload small.
    """
    capped = max(1, min(int(limit or 20), 50))
    return mysql_db.fetch_all(
        """
        SELECT id, user_id, kind, title, body, link_url, read_at, created_at
        FROM notifications
        WHERE user_id = %s
        ORDER BY created_at DESC
        LIMIT %s
        """,
        (int(user_id), capped),
    )


def unread_count(user_id: int) -> int:
    row = mysql_db.fetch_one(
        """
        SELECT COUNT(*) AS n
        FROM notifications
        WHERE user_id = %s AND read_at IS NULL
        """,
        (int(user_id),),
    )
    return int((row or {}).get("n") or 0)


def mark_read(user_id: int, notification_id: int) -> bool:
    """
    Mark a single notification read. Scoped to the user so a malicious
    client can't ack notifications belonging to someone else.
    """
    affected = mysql_db.execute_update(
        """
        UPDATE notifications
        SET read_at = CURRENT_TIMESTAMP
        WHERE id = %s AND user_id = %s AND read_at IS NULL
        """,
        (int(notification_id), int(user_id)),
    )
    return affected > 0


def mark_all_read(user_id: int) -> int:
    """Mark every unread notification for a user read. Returns count."""
    return mysql_db.execute_update(
        """
        UPDATE notifications
        SET read_at = CURRENT_TIMESTAMP
        WHERE user_id = %s AND read_at IS NULL
        """,
        (int(user_id),),
    )


# ──────────────────────────────────────────────────────────────────
#  Preferences
# ──────────────────────────────────────────────────────────────────

def get_preferences(user_id: int) -> Dict[str, bool]:
    """
    Returns the user's notification preferences, falling back to
    ``DEFAULT_PREFERENCES`` (all enabled) when no row exists. Never
    auto-creates a row -- that happens lazily on the first PUT.
    """
    row = mysql_db.fetch_one(
        """
        SELECT study_email_enabled, study_inapp_enabled,
               upgrade_email_enabled, upgrade_inapp_enabled
        FROM notification_preferences
        WHERE user_id = %s
        """,
        (int(user_id),),
    )
    if not row:
        return dict(DEFAULT_PREFERENCES)
    return {key: bool(row.get(key, 1)) for key in DEFAULT_PREFERENCES}


def set_preferences(user_id: int, prefs: Dict[str, bool]) -> Dict[str, bool]:
    """
    Upsert the user's preferences. Unknown keys are silently dropped;
    missing keys keep their previous value. Returns the merged set.
    """
    current = get_preferences(int(user_id))
    merged = {
        key: bool(prefs.get(key, current[key]))
        for key in DEFAULT_PREFERENCES
    }
    mysql_db.execute_update(
        """
        INSERT INTO notification_preferences
            (user_id, study_email_enabled, study_inapp_enabled,
             upgrade_email_enabled, upgrade_inapp_enabled)
        VALUES (%s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            study_email_enabled   = VALUES(study_email_enabled),
            study_inapp_enabled   = VALUES(study_inapp_enabled),
            upgrade_email_enabled = VALUES(upgrade_email_enabled),
            upgrade_inapp_enabled = VALUES(upgrade_inapp_enabled)
        """,
        (
            int(user_id),
            int(merged["study_email_enabled"]),
            int(merged["study_inapp_enabled"]),
            int(merged["upgrade_email_enabled"]),
            int(merged["upgrade_inapp_enabled"]),
        ),
    )
    return merged


# ──────────────────────────────────────────────────────────────────
#  Scheduler idempotency helpers
# ──────────────────────────────────────────────────────────────────

def claim_run(kind: str, run_date: Optional[datetime] = None) -> bool:
    """
    Atomically reserve today's run for ``kind``. Returns True if this
    process is the first to claim it (and should send), False if
    another worker already did. Implemented with INSERT IGNORE so the
    decision happens in a single round-trip.
    """
    when = (run_date or datetime.utcnow()).date()
    affected = mysql_db.execute_update(
        """
        INSERT IGNORE INTO reminder_runs (kind, run_date)
        VALUES (%s, %s)
        """,
        (kind, when),
    )
    return affected > 0


def mark_run_finished(kind: str, sent_count: int, run_date: Optional[datetime] = None) -> None:
    when = (run_date or datetime.utcnow()).date()
    mysql_db.execute_update(
        """
        UPDATE reminder_runs
        SET finished_at = CURRENT_TIMESTAMP,
            sent_count = %s
        WHERE kind = %s AND run_date = %s
        """,
        (int(sent_count), kind, when),
    )
