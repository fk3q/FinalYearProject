"""
Admin dashboard logic: hardcoded admin auth, in-memory token store, and
aggregated stats queries against MySQL.

The geo helper uses the free `ip-api.com` HTTP endpoint (no key required) to
turn a public IP into a country/city. It's only called during registration and
for backfill — failures are swallowed so they never block the user.
"""

import hmac
import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.config import settings
from app.db import mysql_db

logger = logging.getLogger(__name__)


# ── Token store ───────────────────────────────────────────────────────────────
#
# Persisted in `admin_sessions` (MySQL). Survives backend restarts and is
# shared across uvicorn workers — neither was true for the previous in-memory
# dict. Tokens are opaque random strings (token_urlsafe(32) → 43 chars).


@dataclass
class _AdminSession:
    token: str
    expires_at: datetime


def authenticate(username: str, password: str) -> Optional[_AdminSession]:
    """Validate the admin credentials and issue a fresh session token.

    Both checks use `hmac.compare_digest` so an attacker can't time the
    response to learn the username or password one byte at a time. Empty
    expected values (e.g. dev environment with no admin configured) are
    refused outright instead of matching empty input.
    """
    expected_user = settings.ADMIN_USERNAME or ""
    expected_pass = settings.ADMIN_PASSWORD or ""
    if not expected_user or not expected_pass:
        return None

    user_ok = hmac.compare_digest(username or "", expected_user)
    pass_ok = hmac.compare_digest(password or "", expected_pass)
    if not (user_ok and pass_ok):
        return None

    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(hours=settings.ADMIN_TOKEN_TTL_HOURS)
    try:
        mysql_db.execute_insert(
            "INSERT INTO admin_sessions (token, expires_at) VALUES (%s, %s)",
            (token, expires),
        )
    except Exception:
        logger.exception("Could not persist admin session")
        return None
    _purge_expired()
    return _AdminSession(token=token, expires_at=expires)


def is_token_valid(token: Optional[str]) -> bool:
    if not token:
        return False
    row = mysql_db.fetch_one(
        "SELECT expires_at FROM admin_sessions WHERE token = %s LIMIT 1",
        (token,),
    )
    if not row:
        return False
    if row["expires_at"] < datetime.utcnow():
        mysql_db.execute_update(
            "DELETE FROM admin_sessions WHERE token = %s",
            (token,),
        )
        return False
    return True


def revoke_token(token: Optional[str]) -> None:
    if not token:
        return
    mysql_db.execute_update(
        "DELETE FROM admin_sessions WHERE token = %s",
        (token,),
    )


def _purge_expired() -> None:
    """Best-effort cleanup of expired sessions; ignored on DB failure."""
    try:
        mysql_db.execute_update(
            "DELETE FROM admin_sessions WHERE expires_at < %s",
            (datetime.utcnow(),),
        )
    except Exception:
        logger.debug("Admin session purge skipped (DB error)", exc_info=True)


# ── Geo lookup ────────────────────────────────────────────────────────────────

# RFC1918 + loopback prefixes — skip lookup so dev requests don't hit ip-api.
_PRIVATE_PREFIXES = ("10.", "192.168.", "127.", "0.", "169.254.", "::1", "fe80:")


def _is_private(ip: str) -> bool:
    if not ip:
        return True
    if ip in {"localhost", "::1"}:
        return True
    if ip.startswith(_PRIVATE_PREFIXES):
        return True
    if ip.startswith("172."):
        try:
            second = int(ip.split(".")[1])
        except (ValueError, IndexError):
            return False
        return 16 <= second <= 31
    return False


def lookup_geo(ip: Optional[str]) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """Return (country, country_code, city) for the IP, or (None, None, None)."""
    if not ip or _is_private(ip):
        return None, None, None
    try:
        resp = httpx.get(
            f"http://ip-api.com/json/{ip}",
            params={"fields": "status,country,countryCode,city,message"},
            timeout=2.5,
        )
        data = resp.json()
        if data.get("status") != "success":
            logger.info("Geo lookup failed for %s: %s", ip, data.get("message"))
            return None, None, None
        return (
            data.get("country") or None,
            data.get("countryCode") or None,
            data.get("city") or None,
        )
    except Exception as exc:  # pragma: no cover - network
        logger.info("Geo lookup error for %s: %s", ip, exc)
        return None, None, None


# ── Stats aggregation ────────────────────────────────────────────────────────

def _scalar(query: str, params: tuple = ()) -> int:
    row = mysql_db.fetch_one(query, params) or {}
    if not row:
        return 0
    val = next(iter(row.values()), 0)
    return int(val or 0)


def get_dashboard_stats() -> Dict[str, Any]:
    """Aggregated metrics for the admin dashboard."""
    totals = {
        "total_users": _scalar("SELECT COUNT(*) AS c FROM users"),
        "users_today": _scalar(
            "SELECT COUNT(*) AS c FROM users WHERE DATE(created_at) = CURDATE()"
        ),
        "users_last_7_days": _scalar(
            "SELECT COUNT(*) AS c FROM users WHERE created_at >= NOW() - INTERVAL 7 DAY"
        ),
        "users_last_30_days": _scalar(
            "SELECT COUNT(*) AS c FROM users WHERE created_at >= NOW() - INTERVAL 30 DAY"
        ),
        "total_chat_sessions": _scalar("SELECT COUNT(*) AS c FROM chat_sessions"),
        "total_chat_messages": _scalar("SELECT COUNT(*) AS c FROM chat_messages"),
        "active_users_today": _scalar(
            """
            SELECT COUNT(DISTINCT user_id) AS c
            FROM user_usage_daily
            WHERE usage_date = CURDATE() AND seconds_spent > 0
            """
        ),
        "total_seconds_today": _scalar(
            """
            SELECT COALESCE(SUM(seconds_spent), 0) AS c
            FROM user_usage_daily
            WHERE usage_date = CURDATE()
            """
        ),
    }

    signup_trend = mysql_db.fetch_all(
        """
        SELECT DATE(created_at) AS day, COUNT(*) AS count
        FROM users
        WHERE created_at >= NOW() - INTERVAL 30 DAY
        GROUP BY DATE(created_at)
        ORDER BY day ASC
        """,
        (),
    )

    countries = mysql_db.fetch_all(
        """
        SELECT
            COALESCE(NULLIF(signup_country, ''), 'Unknown') AS country,
            COALESCE(NULLIF(signup_country_code, ''), '') AS country_code,
            COUNT(*) AS count
        FROM users
        GROUP BY country, country_code
        ORDER BY count DESC, country ASC
        LIMIT 25
        """,
        (),
    )

    recent_users = mysql_db.fetch_all(
        """
        SELECT id, email, first_name, last_name, signup_country, signup_city, created_at
        FROM users
        ORDER BY created_at DESC
        LIMIT 10
        """,
        (),
    )

    top_users = mysql_db.fetch_all(
        """
        SELECT
            u.id,
            u.email,
            u.first_name,
            u.last_name,
            COALESCE(SUM(d.seconds_spent), 0) AS total_seconds
        FROM users u
        LEFT JOIN user_usage_daily d ON d.user_id = u.id
        GROUP BY u.id, u.email, u.first_name, u.last_name
        ORDER BY total_seconds DESC, u.id ASC
        LIMIT 10
        """,
        (),
    )

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "totals": totals,
        "signup_trend": [
            {
                "day": _to_iso_date(r["day"]),
                "count": int(r["count"] or 0),
            }
            for r in signup_trend
        ],
        "countries": [
            {
                "country": str(r["country"] or "Unknown"),
                "country_code": str(r["country_code"] or ""),
                "count": int(r["count"] or 0),
            }
            for r in countries
        ],
        "recent_users": [
            {
                "id": int(r["id"]),
                "email": str(r["email"]),
                "first_name": str(r["first_name"] or ""),
                "last_name": str(r["last_name"] or ""),
                "country": str(r["signup_country"] or "") or None,
                "city": str(r["signup_city"] or "") or None,
                "created_at": _to_iso_dt(r.get("created_at")),
            }
            for r in recent_users
        ],
        "top_users": [
            {
                "id": int(r["id"]),
                "email": str(r["email"]),
                "first_name": str(r["first_name"] or ""),
                "last_name": str(r["last_name"] or ""),
                "total_seconds": int(r["total_seconds"] or 0),
            }
            for r in top_users
        ],
    }


def _to_iso_date(value: Any) -> str:
    if value is None:
        return ""
    try:
        return value.isoformat()
    except AttributeError:
        return str(value)


def _to_iso_dt(value: Any) -> Optional[str]:
    if value is None:
        return None
    try:
        return value.isoformat()
    except AttributeError:
        return str(value)


def get_all_users_detailed() -> Dict[str, Any]:
    """
    Return a comprehensive record for every registered user — personal details,
    usage totals, chat activity, and uploaded documents. Powers the admin
    dashboard's deep-dive users panel and its charts.
    """
    from app.services import document_service  # local import avoids cycles

    rows = mysql_db.fetch_all(
        """
        SELECT
            u.id,
            u.email,
            u.first_name,
            u.last_name,
            u.phone,
            u.signup_country,
            u.signup_country_code,
            u.signup_city,
            u.signup_ip,
            u.created_at,
            COALESCE(usage_sub.total_seconds, 0)   AS total_seconds,
            COALESCE(usage_sub.active_days, 0)      AS active_days,
            usage_sub.last_active_date              AS last_active_date,
            COALESCE(sess.session_count, 0)         AS chat_sessions,
            COALESCE(msg.message_count, 0)          AS chat_messages
        FROM users u
        LEFT JOIN (
            SELECT user_id,
                   SUM(seconds_spent) AS total_seconds,
                   COUNT(*)            AS active_days,
                   MAX(usage_date)     AS last_active_date
            FROM user_usage_daily
            GROUP BY user_id
        ) usage_sub ON usage_sub.user_id = u.id
        LEFT JOIN (
            SELECT user_id, COUNT(*) AS session_count
            FROM chat_sessions
            GROUP BY user_id
        ) sess ON sess.user_id = u.id
        LEFT JOIN (
            SELECT cs.user_id, COUNT(cm.id) AS message_count
            FROM chat_sessions cs
            LEFT JOIN chat_messages cm ON cm.session_id = cs.id
            GROUP BY cs.user_id
        ) msg ON msg.user_id = u.id
        ORDER BY u.created_at ASC, u.id ASC
        """,
        (),
    )

    docs_by_user = document_service.summarize_documents_by_user()
    now = datetime.utcnow()

    users: List[Dict[str, Any]] = []
    for r in rows:
        uid = int(r["id"])
        created_at = r.get("created_at")
        days_as_user: Optional[int] = None
        if created_at is not None:
            try:
                delta = now - created_at
                days_as_user = max(0, int(delta.total_seconds() // 86400))
            except TypeError:
                days_as_user = None

        user_docs = docs_by_user.get(uid, [])
        doc_type_counts: Dict[str, int] = {}
        total_size_kb = 0.0
        for d in user_docs:
            dt = (d.get("doc_type") or "OTHER").upper()
            doc_type_counts[dt] = doc_type_counts.get(dt, 0) + 1
            total_size_kb += float(d.get("file_size_kb") or 0)

        users.append({
            "id":                  uid,
            "email":               str(r["email"]),
            "first_name":          str(r["first_name"] or ""),
            "last_name":           str(r["last_name"] or ""),
            "phone":               str(r["phone"] or ""),
            "country":             str(r["signup_country"] or "") or None,
            "country_code":        str(r["signup_country_code"] or "") or None,
            "city":                str(r["signup_city"] or "") or None,
            "signup_ip":           str(r["signup_ip"] or "") or None,
            "created_at":          _to_iso_dt(created_at),
            "days_as_user":        days_as_user,
            "total_seconds":       int(r["total_seconds"] or 0),
            "active_days":         int(r["active_days"] or 0),
            "last_active_date":    _to_iso_date(r.get("last_active_date")) or None,
            "chat_sessions":       int(r["chat_sessions"] or 0),
            "chat_messages":       int(r["chat_messages"] or 0),
            "document_count":      len(user_docs),
            "document_types":      doc_type_counts,
            "total_document_kb":   round(total_size_kb, 2),
            "documents":           user_docs,
        })

    return {
        "generated_at": now.isoformat(),
        "users": users,
    }


def backfill_missing_geo(limit: int = 50) -> int:
    """
    Look up geo for users that have an IP but no country yet. Used as a
    one-shot backfill triggered from the dashboard. Returns rows updated.
    """
    rows = mysql_db.fetch_all(
        """
        SELECT id, signup_ip
        FROM users
        WHERE signup_ip IS NOT NULL
          AND signup_ip <> ''
          AND (signup_country IS NULL OR signup_country = '')
        LIMIT %s
        """,
        (int(limit),),
    )
    updated = 0
    for r in rows:
        country, code, city = lookup_geo(str(r["signup_ip"]))
        if country or code or city:
            from app.services import user_service  # avoid circular at import time

            user_service.update_signup_geo(
                int(r["id"]),
                country=country,
                country_code=code,
                city=city,
            )
            updated += 1
    return updated
