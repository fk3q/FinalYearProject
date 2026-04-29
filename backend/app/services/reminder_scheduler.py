"""
Bi-weekly reminder scheduler.

Runs inside the FastAPI process via APScheduler with two cron triggers:

  · ``study_reminder``    — every Monday + Thursday at 09:00 UTC, sent
    to every active user (subject to their per-user opt-out).
  · ``upgrade_reminder``  — same cadence, but only fires for users
    whose ``subscription_tier`` is currently ``'free'``.

Idempotency
-----------
The scheduler is started in the FastAPI lifespan, so under multi-
worker deploys (e.g. uvicorn ``--workers 4``) every worker would
otherwise fire its own batch and the user would receive 4 copies of
each email. We use ``notification_service.claim_run`` (an INSERT
IGNORE on the ``reminder_runs`` PK ``(kind, run_date)``) as a cheap
distributed lock: only the first worker to insert wins and actually
sends; everyone else sees ``False`` and quietly returns.

Dispatch
--------
For each batch we walk the users table in pages of 200 to keep memory
flat even on large installs, look up each user's preferences (with the
sensible "all on" default for first-time users), and dispatch the
in-app notification + the email with respect to those toggles. Failed
emails are logged and don't block the rest of the batch.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Dict, List, Optional

from app.config import settings
from app.db import mysql_db
from app.services import (
    email_service,
    notification_service,
    reminder_templates,
)

logger = logging.getLogger(__name__)


# Cron timing. Pulled out as constants so a future "let users pick
# their own days" feature can override them without touching the run
# logic itself. UTC-only -- per-user time zones are out of scope for v1.
REMINDER_DAYS_OF_WEEK = "mon,thu"
REMINDER_HOUR = 9
REMINDER_MINUTE = 0


# ──────────────────────────────────────────────────────────────────
#  User pagination
# ──────────────────────────────────────────────────────────────────

def _iter_users(only_free: bool = False, page_size: int = 200):
    """
    Generator that yields users one row at a time, paged through MySQL
    so we never load the whole users table into memory at once.
    """
    last_id = 0
    while True:
        if only_free:
            rows = mysql_db.fetch_all(
                """
                SELECT id, email, first_name,
                       COALESCE(subscription_tier, 'free') AS subscription_tier
                FROM users
                WHERE id > %s
                  AND COALESCE(subscription_tier, 'free') = 'free'
                ORDER BY id ASC
                LIMIT %s
                """,
                (int(last_id), int(page_size)),
            )
        else:
            rows = mysql_db.fetch_all(
                """
                SELECT id, email, first_name,
                       COALESCE(subscription_tier, 'free') AS subscription_tier
                FROM users
                WHERE id > %s
                ORDER BY id ASC
                LIMIT %s
                """,
                (int(last_id), int(page_size)),
            )
        if not rows:
            return
        for row in rows:
            yield row
        last_id = rows[-1]["id"]
        if len(rows) < page_size:
            return


# ──────────────────────────────────────────────────────────────────
#  Single-user dispatch
# ──────────────────────────────────────────────────────────────────

def _send_one(
    user: Dict,
    template: Dict[str, str],
    kind: str,
    inapp_pref_key: str,
    email_pref_key: str,
) -> bool:
    """
    Honour the user's preferences and dispatch on the channels that
    are enabled. Returns True if anything was actually sent (used for
    the per-batch counter). Errors on one channel don't suppress the
    other -- email failures are common and shouldn't lose the in-app
    record.
    """
    prefs = notification_service.get_preferences(int(user["id"]))
    sent_anything = False

    if prefs.get(inapp_pref_key, True):
        try:
            notification_service.create_for_user(
                user_id=int(user["id"]),
                kind=kind,
                title=template["title"],
                body=template["body"],
                link_url=template.get("link_url"),
            )
            sent_anything = True
        except Exception:
            logger.exception(
                "in-app notify failed user_id=%s kind=%s", user["id"], kind
            )

    if prefs.get(email_pref_key, True) and (user.get("email") or "").strip():
        try:
            ok = email_service.send_email(
                to_email=str(user["email"]),
                subject=template["subject"],
                text=template["text"],
                html=template.get("html"),
            )
            sent_anything = sent_anything or ok
        except Exception:
            logger.exception(
                "email notify failed user_id=%s kind=%s", user["id"], kind
            )

    return sent_anything


# ──────────────────────────────────────────────────────────────────
#  Batch jobs (the things APScheduler actually runs)
# ──────────────────────────────────────────────────────────────────

def run_study_reminder_batch(now: Optional[datetime] = None) -> int:
    """
    Send the study nudge to every user. Returns the number of users
    we successfully dispatched at least one channel for.
    """
    kind = notification_service.KIND_STUDY_REMINDER
    if not notification_service.claim_run(kind, run_date=now):
        logger.info("study reminder already claimed for today; skipping")
        return 0

    sent = 0
    try:
        for user in _iter_users(only_free=False):
            template = reminder_templates.study_reminder(
                user.get("first_name") or "",
            )
            if _send_one(
                user=user,
                template=template,
                kind=kind,
                inapp_pref_key="study_inapp_enabled",
                email_pref_key="study_email_enabled",
            ):
                sent += 1
    finally:
        notification_service.mark_run_finished(kind, sent_count=sent, run_date=now)
    logger.info("study reminder batch finished — sent=%s", sent)
    return sent


def run_upgrade_reminder_batch(now: Optional[datetime] = None) -> int:
    """
    Send the upgrade prompt to every *free-tier* user. Same idempotency
    contract as the study batch.
    """
    kind = notification_service.KIND_UPGRADE_REMINDER
    if not notification_service.claim_run(kind, run_date=now):
        logger.info("upgrade reminder already claimed for today; skipping")
        return 0

    sent = 0
    try:
        for user in _iter_users(only_free=True):
            template = reminder_templates.upgrade_reminder(
                user.get("first_name") or "",
            )
            if _send_one(
                user=user,
                template=template,
                kind=kind,
                inapp_pref_key="upgrade_inapp_enabled",
                email_pref_key="upgrade_email_enabled",
            ):
                sent += 1
    finally:
        notification_service.mark_run_finished(kind, sent_count=sent, run_date=now)
    logger.info("upgrade reminder batch finished — sent=%s", sent)
    return sent


# ──────────────────────────────────────────────────────────────────
#  APScheduler wiring
# ──────────────────────────────────────────────────────────────────

# Module-level singleton so we can `start()` from FastAPI's lifespan
# and `shutdown()` cleanly when the process exits.
_scheduler = None  # type: ignore[assignment]


def start_scheduler() -> None:
    """
    Boot the AsyncIOScheduler (idempotent — safe to call multiple
    times). Uses a soft import so the backend still boots when
    APScheduler isn't installed yet (helpful in dev / CI).
    """
    global _scheduler

    if _scheduler is not None:
        logger.debug("reminder scheduler already running")
        return

    if not getattr(settings, "REMINDERS_ENABLED", True):
        logger.info(
            "reminder scheduler disabled via REMINDERS_ENABLED=false; skipping"
        )
        return

    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.triggers.cron import CronTrigger
    except ImportError:
        logger.warning(
            "APScheduler not installed -- reminder scheduler disabled. "
            "Add `apscheduler` to backend/requirements.txt and rebuild."
        )
        return

    scheduler = AsyncIOScheduler(timezone="UTC")

    trigger = CronTrigger(
        day_of_week=REMINDER_DAYS_OF_WEEK,
        hour=REMINDER_HOUR,
        minute=REMINDER_MINUTE,
    )

    scheduler.add_job(
        run_study_reminder_batch,
        trigger=trigger,
        id="study_reminder_batch",
        name="Study reminder (Mon + Thu, 09:00 UTC)",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        run_upgrade_reminder_batch,
        trigger=trigger,
        id="upgrade_reminder_batch",
        name="Upgrade reminder (Mon + Thu, 09:00 UTC)",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    scheduler.start()
    _scheduler = scheduler
    logger.info(
        "reminder scheduler started (cron: dow=%s hour=%s minute=%s UTC)",
        REMINDER_DAYS_OF_WEEK,
        REMINDER_HOUR,
        REMINDER_MINUTE,
    )


def stop_scheduler() -> None:
    """Tear the scheduler down -- called from FastAPI lifespan exit."""
    global _scheduler
    if _scheduler is None:
        return
    try:
        _scheduler.shutdown(wait=False)
    except Exception:
        logger.exception("reminder scheduler shutdown failed")
    finally:
        _scheduler = None
        logger.info("reminder scheduler stopped")


# Tiny helper exposed for an admin "Send now" button (not wired in
# v1 -- left here so the test scripts can drive a batch manually
# without waiting for cron).
def force_run_all() -> Dict[str, int]:
    return {
        "study": run_study_reminder_batch(),
        "upgrade": run_upgrade_reminder_batch(),
    }
