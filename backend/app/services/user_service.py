"""
User registration, login, and profile lookup (MySQL + bcrypt).
"""

from typing import Any, Dict, Optional

import bcrypt

from app.db import mysql_db

# Stored as data URL (e.g. data:image/png;base64,...) — keep server payload bounded
_MAX_PROFILE_PICTURE_CHARS = 700_000


def _hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(plain: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain.encode("utf-8"),
            password_hash.encode("utf-8"),
        )
    except ValueError:
        return False


def create_user(
    email: str,
    password: str,
    first_name: str,
    last_name: str,
    phone: str,
    signup_ip: Optional[str] = None,
    signup_country: Optional[str] = None,
    signup_country_code: Optional[str] = None,
    signup_city: Optional[str] = None,
) -> int:
    email_norm = email.strip().lower()
    q = """
    INSERT INTO users (
        email, password_hash, first_name, last_name, phone,
        signup_ip, signup_country, signup_country_code, signup_city
    )
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    return mysql_db.execute_insert(
        q,
        (
            email_norm,
            _hash_password(password),
            first_name.strip(),
            last_name.strip(),
            phone.strip(),
            signup_ip,
            signup_country,
            signup_country_code,
            signup_city,
        ),
    )


def update_signup_geo(
    user_id: int,
    *,
    country: Optional[str],
    country_code: Optional[str],
    city: Optional[str],
) -> None:
    """Best-effort backfill of geo columns after registration."""
    mysql_db.execute_update(
        """
        UPDATE users
        SET signup_country = COALESCE(%s, signup_country),
            signup_country_code = COALESCE(%s, signup_country_code),
            signup_city = COALESCE(%s, signup_city)
        WHERE id = %s
        """,
        (country, country_code, city, user_id),
    )


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    email_norm = email.strip().lower()
    q = """
    SELECT id, email, password_hash, first_name, last_name, phone, created_at,
           profile_picture_data,
           COALESCE(subscription_tier, 'free') AS subscription_tier,
           COALESCE(theme, 'light') AS theme,
           google_sub, facebook_id, microsoft_sub
    FROM users WHERE email = %s LIMIT 1
    """
    return mysql_db.fetch_one(q, (email_norm,))


def get_public_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    q = """
    SELECT id, email, first_name, last_name, phone, created_at,
           profile_picture_data,
           COALESCE(subscription_tier, 'free') AS subscription_tier,
           COALESCE(theme, 'light') AS theme
    FROM users WHERE id = %s LIMIT 1
    """
    row = mysql_db.fetch_one(q, (user_id,))
    return row


def verify_login(email: str, password: str) -> Optional[Dict[str, Any]]:
    row = get_user_by_email(email)
    if not row:
        return None
    ph = row.get("password_hash")
    if not ph:
        return None
    if not _verify_password(password, ph):
        return None
    row.pop("password_hash", None)
    return row


def get_user_by_google_sub(google_sub: str) -> Optional[Dict[str, Any]]:
    q = """
    SELECT id, email, first_name, last_name, phone, created_at,
           COALESCE(subscription_tier, 'free') AS subscription_tier,
           COALESCE(theme, 'light') AS theme, google_sub, google_email
    FROM users WHERE google_sub = %s LIMIT 1
    """
    return mysql_db.fetch_one(q, (google_sub,))


def upsert_google_user(
    *,
    google_sub: str,
    email: str,
    first_name: str,
    last_name: str,
    signup_ip: Optional[str] = None,
    signup_country: Optional[str] = None,
    signup_country_code: Optional[str] = None,
    signup_city: Optional[str] = None,
) -> int:
    """
    Find or create a user row for a Google account.

    - If `google_sub` already exists → return that id (refresh google_email).
    - Else if email exists:
        - If linked to a different google_sub → 409 (google_account_mismatch).
        - If linked to a different OAuth provider (Facebook / Microsoft) →
          409 (cross-provider conflict, requires explicit linking flow).
        - Otherwise (including rows that already have a password_hash):
          attach this google_sub to the existing row. We trust Google's
          `email_verified` claim — it was already enforced in
          `verify_google_id_token` — so the user demonstrably owns the
          email address. This gives the "sign in with Google any time"
          UX users expect on first try, while password-based login keeps
          working unchanged.
    - Else insert a new Google-only user (password_hash = NULL, phone = placeholder).
    """
    email_norm = email.strip().lower()
    existing_sub = get_user_by_google_sub(google_sub)
    if existing_sub:
        mysql_db.execute_update(
            "UPDATE users SET google_email = %s WHERE id = %s",
            (email_norm, int(existing_sub["id"])),
        )
        return int(existing_sub["id"])

    by_email = get_user_by_email(email_norm)
    if by_email:
        uid = int(by_email["id"])
        existing_gs = by_email.get("google_sub")
        existing_fb = by_email.get("facebook_id")
        existing_ms = by_email.get("microsoft_sub")
        if existing_gs and str(existing_gs) != google_sub:
            raise ValueError("google_account_mismatch")
        if existing_fb:
            raise ValueError("facebook_account_exists")
        if existing_ms:
            raise ValueError("microsoft_account_exists")
        # Auto-link Google to an existing email/password account. We don't
        # overwrite first_name / last_name here because the user may have
        # customised them in the profile page; we only fill in fields that
        # are currently blank.
        mysql_db.execute_update(
            """
            UPDATE users
            SET google_sub   = %s,
                google_email = %s,
                first_name   = CASE WHEN COALESCE(first_name, '') = '' THEN %s ELSE first_name END,
                last_name    = CASE WHEN COALESCE(last_name,  '') = '' THEN %s ELSE last_name  END
            WHERE id = %s
            """,
            (google_sub, email_norm, first_name.strip(), last_name.strip(), uid),
        )
        return uid

    q = """
    INSERT INTO users (
        email, password_hash, first_name, last_name, phone,
        signup_ip, signup_country, signup_country_code, signup_city,
        google_sub, google_email
    )
    VALUES (%s, NULL, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    return mysql_db.execute_insert(
        q,
        (
            email_norm,
            first_name.strip(),
            last_name.strip(),
            "google-oauth",
            signup_ip,
            signup_country,
            signup_country_code,
            signup_city,
            google_sub,
            email_norm,
        ),
    )


def get_user_by_facebook_id(fb_id: str) -> Optional[Dict[str, Any]]:
    q = """
    SELECT id, email, first_name, last_name, phone, created_at,
           COALESCE(subscription_tier, 'free') AS subscription_tier,
           COALESCE(theme, 'light') AS theme, facebook_id, facebook_email
    FROM users WHERE facebook_id = %s LIMIT 1
    """
    return mysql_db.fetch_one(q, (fb_id,))


def upsert_facebook_user(
    *,
    facebook_id: str,
    email: str,
    first_name: str,
    last_name: str,
    signup_ip: Optional[str] = None,
    signup_country: Optional[str] = None,
    signup_country_code: Optional[str] = None,
    signup_city: Optional[str] = None,
) -> int:
    email_norm = email.strip().lower()
    existing = get_user_by_facebook_id(facebook_id)
    if existing:
        mysql_db.execute_update(
            "UPDATE users SET facebook_email = %s WHERE id = %s",
            (email_norm, int(existing["id"])),
        )
        return int(existing["id"])

    by_email = get_user_by_email(email_norm)
    if by_email:
        uid = int(by_email["id"])
        existing_fb = by_email.get("facebook_id")
        if existing_fb and str(existing_fb) != facebook_id:
            raise ValueError("facebook_account_mismatch")
        google_sub = by_email.get("google_sub")
        if google_sub:
            raise ValueError("google_account_exists")
        if by_email.get("microsoft_sub"):
            raise ValueError("microsoft_account_exists")
        # Auto-link Facebook to an existing email/password account.
        # Facebook returns an email only when the user has confirmed it on
        # their Facebook profile, so this is consistent with Google's
        # email_verified policy. Existing names aren't overwritten.
        mysql_db.execute_update(
            """
            UPDATE users
            SET facebook_id    = %s,
                facebook_email = %s,
                first_name     = CASE WHEN COALESCE(first_name, '') = '' THEN %s ELSE first_name END,
                last_name      = CASE WHEN COALESCE(last_name,  '') = '' THEN %s ELSE last_name  END
            WHERE id = %s
            """,
            (facebook_id, email_norm, first_name.strip(), last_name.strip(), uid),
        )
        return uid

    q = """
    INSERT INTO users (
        email, password_hash, first_name, last_name, phone,
        signup_ip, signup_country, signup_country_code, signup_city,
        facebook_id, facebook_email
    )
    VALUES (%s, NULL, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    return mysql_db.execute_insert(
        q,
        (
            email_norm,
            first_name.strip(),
            last_name.strip(),
            "facebook-oauth",
            signup_ip,
            signup_country,
            signup_country_code,
            signup_city,
            facebook_id,
            email_norm,
        ),
    )


def get_user_by_microsoft_sub(microsoft_sub: str) -> Optional[Dict[str, Any]]:
    q = """
    SELECT id, email, first_name, last_name, phone, created_at,
           COALESCE(subscription_tier, 'free') AS subscription_tier,
           COALESCE(theme, 'light') AS theme, microsoft_sub, microsoft_email
    FROM users WHERE microsoft_sub = %s LIMIT 1
    """
    return mysql_db.fetch_one(q, (microsoft_sub,))


def upsert_microsoft_user(
    *,
    microsoft_sub: str,
    email: str,
    first_name: str,
    last_name: str,
    signup_ip: Optional[str] = None,
    signup_country: Optional[str] = None,
    signup_country_code: Optional[str] = None,
    signup_city: Optional[str] = None,
) -> int:
    """
    Find or create a user row for a Microsoft (Entra ID) account.

    - If `microsoft_sub` already exists → return that id (refresh microsoft_email).
    - Else if email exists:
        - If linked to a different microsoft_sub → 409 (microsoft_account_mismatch).
        - If linked to Google → 409 (google_account_exists).
        - If linked to Facebook → 409 (facebook_account_exists).
        - Otherwise (including rows that already have a password_hash):
          attach this microsoft_sub to the existing row. Microsoft Entra
          ID tokens come from a JWKS-verified issuer, so the email claim
          can be trusted in the same way we trust Google's
          `email_verified` claim — the user owns the address.
    - Else insert a new Microsoft-only user (password_hash = NULL, phone placeholder).
    """
    email_norm = email.strip().lower()
    existing = get_user_by_microsoft_sub(microsoft_sub)
    if existing:
        mysql_db.execute_update(
            "UPDATE users SET microsoft_email = %s WHERE id = %s",
            (email_norm, int(existing["id"])),
        )
        return int(existing["id"])

    by_email = get_user_by_email(email_norm)
    if by_email:
        uid = int(by_email["id"])
        existing_ms = by_email.get("microsoft_sub")
        if existing_ms and str(existing_ms) != microsoft_sub:
            raise ValueError("microsoft_account_mismatch")
        if by_email.get("google_sub"):
            raise ValueError("google_account_exists")
        if by_email.get("facebook_id"):
            raise ValueError("facebook_account_exists")
        # Auto-link Microsoft to an existing email/password account.
        # Existing names aren't overwritten.
        mysql_db.execute_update(
            """
            UPDATE users
            SET microsoft_sub  = %s,
                microsoft_email = %s,
                first_name     = CASE WHEN COALESCE(first_name, '') = '' THEN %s ELSE first_name END,
                last_name      = CASE WHEN COALESCE(last_name,  '') = '' THEN %s ELSE last_name  END
            WHERE id = %s
            """,
            (microsoft_sub, email_norm, first_name.strip(), last_name.strip(), uid),
        )
        return uid

    q = """
    INSERT INTO users (
        email, password_hash, first_name, last_name, phone,
        signup_ip, signup_country, signup_country_code, signup_city,
        microsoft_sub, microsoft_email
    )
    VALUES (%s, NULL, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    return mysql_db.execute_insert(
        q,
        (
            email_norm,
            first_name.strip(),
            last_name.strip(),
            "microsoft-oauth",
            signup_ip,
            signup_country,
            signup_country_code,
            signup_city,
            microsoft_sub,
            email_norm,
        ),
    )


def get_user_profile_detail(user_id: int) -> Optional[Dict[str, Any]]:
    """Public profile fields + optional profile picture data URL + today's usage seconds."""
    q = """
    SELECT id, email, first_name, last_name, phone, created_at, profile_picture_data,
           COALESCE(subscription_tier, 'free') AS subscription_tier,
           COALESCE(theme, 'light') AS theme,
           stripe_customer_id
    FROM users WHERE id = %s LIMIT 1
    """
    row = mysql_db.fetch_one(q, (user_id,))
    if not row:
        return None
    usage_q = """
    SELECT COALESCE(seconds_spent, 0) AS s FROM user_usage_daily
    WHERE user_id = %s AND usage_date = CURDATE()
    """
    urow = mysql_db.fetch_one(usage_q, (user_id,))
    daily_seconds = int(urow["s"]) if urow else 0
    pic = row.get("profile_picture_data")
    return {
        "id": int(row["id"]),
        "email": str(row["email"]),
        "first_name": str(row["first_name"]),
        "last_name": str(row["last_name"]),
        "phone": str(row["phone"]),
        "created_at": row.get("created_at"),
        "profile_picture_url": str(pic) if pic else None,
        "daily_time_seconds": daily_seconds,
        "subscription_tier": str(row.get("subscription_tier") or "free"),
        "has_stripe_customer": bool(row.get("stripe_customer_id")),
        "theme": str(row.get("theme") or "light"),
    }


def update_profile_picture(user_id: int, data_url: Optional[str]) -> bool:
    """
    Set or clear profile picture. data_url should be a data: URL or None to remove.
    Returns False if user not found.
    """
    conn = mysql_db.get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE id=%s LIMIT 1", (user_id,))
            if not cur.fetchone():
                return False
            cur.execute(
                "UPDATE users SET profile_picture_data = %s WHERE id = %s",
                (data_url, user_id),
            )
        conn.commit()
        return True
    finally:
        conn.close()


def update_user_theme(user_id: int, theme: str) -> bool:
    """Persist the user's UI theme preference. Returns False if user not found."""
    if theme not in ("light", "dark"):
        raise ValueError("Theme must be 'light' or 'dark'.")
    affected = mysql_db.execute_update(
        "UPDATE users SET theme = %s WHERE id = %s",
        (theme, user_id),
    )
    return affected > 0


def validate_profile_picture_payload(data_url: Optional[str]) -> Optional[str]:
    """Return cleaned data URL or None to clear. Raises ValueError if invalid."""
    if data_url is None:
        return None
    if isinstance(data_url, str) and data_url.strip() == "":
        return None
    if not isinstance(data_url, str):
        raise ValueError("Profile picture must be a data URL string.")
    if not data_url.startswith("data:image/"):
        raise ValueError("Profile picture must be a data URL (image).")
    if len(data_url) > _MAX_PROFILE_PICTURE_CHARS:
        raise ValueError("Image is too large; try a smaller file.")
    return data_url


def add_daily_usage_seconds(user_id: int, seconds: int) -> None:
    """Add seconds to today's bucket for the user (ignored if seconds < 1)."""
    if seconds < 1:
        return
    seconds = min(int(seconds), 600)
    conn = mysql_db.get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO user_usage_daily (user_id, usage_date, seconds_spent)
                VALUES (%s, CURDATE(), %s)
                ON DUPLICATE KEY UPDATE
                    seconds_spent = seconds_spent + VALUES(seconds_spent)
                """,
                (user_id, seconds),
            )
        conn.commit()
    finally:
        conn.close()
