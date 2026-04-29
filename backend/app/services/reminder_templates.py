"""
Copy + HTML markup for the reminder emails and in-app notifications.

Kept in a single file so non-developers can tweak phrasing without
hunting through the scheduler. Each template returns a dataclass-ish
dict the scheduler hands directly to ``email_service.send_email`` and
``notification_service.create_for_user``.

The frontend URL (used for the "back to studying" CTA) is read from
``settings.FRONTEND_URL``; if it's blank we fall back to a relative
``/chat`` link, which still works when the email client opens it from
the same origin.
"""

from __future__ import annotations

from typing import Dict

from app.config import settings


# Resolved once per process. Trailing slashes stripped so we can
# append `/chat` / `/subscription` without doubling them up.
def _frontend_base() -> str:
    raw = (settings.FRONTEND_URL or "").rstrip("/")
    return raw or ""


def _link(path: str) -> str:
    """Absolute link if FRONTEND_URL is set, else relative."""
    base = _frontend_base()
    if not path.startswith("/"):
        path = "/" + path
    return f"{base}{path}" if base else path


# ──────────────────────────────────────────────────────────────────
#  Study reminder (everyone, twice a week)
# ──────────────────────────────────────────────────────────────────

def study_reminder(first_name: str) -> Dict[str, str]:
    """Friendly nudge to come back and study. Goes to every user."""
    chat_url = _link("/chat")
    name = (first_name or "there").strip() or "there"

    subject = "Time to get back to studying with Laboracle"

    text = (
        f"Hey {name},\n\n"
        "Just a quick reminder -- your future self will thank you "
        "for putting in some study time today. Open Laboracle, drop "
        "in your notes or a question, and keep your momentum going.\n\n"
        f"Pick up where you left off: {chat_url}\n\n"
        "Small, regular sessions beat last-minute cramming every "
        "time. See you in there.\n\n"
        "— The Laboracle team\n"
    )

    html = f"""
    <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                background:#f5f4ff; padding:32px 16px; color:#1f2336;">
      <div style="max-width:520px; margin:0 auto; background:#ffffff;
                  border-radius:16px; padding:32px;
                  box-shadow:0 8px 24px rgba(80,60,180,0.08);">
        <h1 style="margin:0 0 12px; font-size:22px; color:#4f46e5;">
          Hey {name}, ready to put in 15 minutes?
        </h1>
        <p style="font-size:15px; line-height:1.6; margin:0 0 20px;">
          Your future self will thank you for showing up today.
          Even one short session keeps the streak alive and your
          memory sharp.
        </p>
        <p style="font-size:15px; line-height:1.6; margin:0 0 24px;">
          Open Laboracle, drop in your notes or a question, and let's
          keep building on what you've already learned.
        </p>
        <a href="{chat_url}" target="_blank"
           style="display:inline-block; background:#4f46e5; color:#fff;
                  text-decoration:none; padding:12px 22px; border-radius:999px;
                  font-weight:600; font-size:15px;">
          Continue studying →
        </a>
        <p style="font-size:12px; line-height:1.5; margin:32px 0 0; color:#7c7e94;">
          You're receiving this because Laboracle reminders are turned
          on. You can adjust them any time from Settings.
        </p>
      </div>
    </div>
    """

    return {
        "subject": subject,
        "text": text,
        "html": html,
        "title": "Time to get back to studying",
        "body": (
            "Even 15 minutes today keeps your momentum going. "
            "Open the chat and pick up where you left off."
        ),
        "link_url": "/chat",
    }


# ──────────────────────────────────────────────────────────────────
#  Upgrade reminder (free users only, twice a week)
# ──────────────────────────────────────────────────────────────────

def upgrade_reminder(first_name: str) -> Dict[str, str]:
    """Soft pitch toward the Advanced subscription tier."""
    sub_url = _link("/subscription")
    name = (first_name or "there").strip() or "there"

    subject = "Unlock GPT-5 and Claude Opus on Laboracle Advanced"

    text = (
        f"Hi {name},\n\n"
        "You're currently on the free plan, which is great for "
        "getting started -- but Advanced unlocks the heavy hitters: "
        "GPT-5, Claude Opus 4.7, unlimited voice transcription, and "
        "higher monthly chat quotas.\n\n"
        f"Compare plans: {sub_url}\n\n"
        "Cancel any time, no lock-ins. Hope to see you there.\n\n"
        "— The Laboracle team\n"
    )

    html = f"""
    <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                background:#f5f4ff; padding:32px 16px; color:#1f2336;">
      <div style="max-width:520px; margin:0 auto; background:#ffffff;
                  border-radius:16px; padding:32px;
                  box-shadow:0 8px 24px rgba(80,60,180,0.08);">
        <h1 style="margin:0 0 12px; font-size:22px; color:#4f46e5;">
          {name}, ready to study with the heavy hitters?
        </h1>
        <p style="font-size:15px; line-height:1.6; margin:0 0 16px;">
          Laboracle Advanced unlocks the most powerful AI models we
          offer, plus higher monthly limits across the board:
        </p>
        <ul style="font-size:15px; line-height:1.7; margin:0 0 24px; padding-left:20px;">
          <li><strong>GPT-5</strong> &mdash; OpenAI's flagship reasoner</li>
          <li><strong>Claude Opus 4.7</strong> &mdash; Anthropic's deep-thinker</li>
          <li><strong>Unlimited voice</strong> transcription</li>
          <li><strong>Higher monthly</strong> chat &amp; upload quotas</li>
        </ul>
        <a href="{sub_url}" target="_blank"
           style="display:inline-block; background:#7c3aed; color:#fff;
                  text-decoration:none; padding:12px 22px; border-radius:999px;
                  font-weight:600; font-size:15px;">
          See plans →
        </a>
        <p style="font-size:12px; line-height:1.5; margin:32px 0 0; color:#7c7e94;">
          Cancel any time. You're getting this because you're on the
          free plan -- toggle reminders off in Settings any time.
        </p>
      </div>
    </div>
    """

    return {
        "subject": subject,
        "text": text,
        "html": html,
        "title": "Unlock GPT-5 + Claude Opus with Advanced",
        "body": (
            "Upgrade to Advanced for the most powerful models, "
            "unlimited voice transcription, and higher monthly limits."
        ),
        "link_url": "/subscription",
    }
