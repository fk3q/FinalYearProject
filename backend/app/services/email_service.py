"""
Email sending (SMTP). If SMTP is not configured, messages are logged to the
console so development flows still work without a real mail server.
"""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)


def is_configured() -> bool:
    from_addr = settings.SMTP_FROM_EMAIL or settings.SMTP_USERNAME
    return bool(settings.SMTP_HOST and from_addr)


def _build_message(to_email: str, subject: str, text: str, html: Optional[str]) -> EmailMessage:
    msg = EmailMessage()
    from_name = settings.SMTP_FROM_NAME or settings.APP_NAME
    from_addr = settings.SMTP_FROM_EMAIL or settings.SMTP_USERNAME
    msg["From"] = f"{from_name} <{from_addr}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    return msg


def send_email(to_email: str, subject: str, text: str, html: Optional[str] = None) -> bool:
    """
    Send an email via SMTP. Returns True if it was actually sent, False if it
    was logged only (SMTP not configured or sending failed).
    """
    if not is_configured():
        logger.info(
            "[email-dev] SMTP not configured; would send to %s | subject=%r | body=\n%s",
            to_email,
            subject,
            text,
        )
        return False

    msg = _build_message(to_email, subject, text, html)

    try:
        if settings.SMTP_PORT == 465:
            with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
                if settings.SMTP_USERNAME:
                    server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                server.send_message(msg)
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
                server.ehlo()
                if settings.SMTP_USE_TLS:
                    server.starttls()
                    server.ehlo()
                if settings.SMTP_USERNAME:
                    server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                server.send_message(msg)
        logger.info("Sent email to %s (subject=%r)", to_email, subject)
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to_email)
        return False
