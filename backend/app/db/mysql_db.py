"""
MySQL connection helpers and schema init for user accounts.
"""

import logging
from typing import Any, Dict, Optional

import pymysql
from pymysql.cursors import DictCursor
from pymysql.err import IntegrityError, OperationalError

from app.config import settings

logger = logging.getLogger(__name__)


def get_connection():
    """Return a new connection (DictCursor). Caller should close when done."""
    return pymysql.connect(
        host=settings.MYSQL_HOST,
        port=settings.MYSQL_PORT,
        user=settings.MYSQL_USER,
        password=settings.MYSQL_PASSWORD,
        database=settings.MYSQL_DATABASE,
        charset="utf8mb4",
        cursorclass=DictCursor,
        autocommit=False,
    )


def init_db_schema() -> None:
    """Create users table if it does not exist."""
    ddl = """
    CREATE TABLE IF NOT EXISTS users (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        phone VARCHAR(32) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_users_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(ddl)
            # Profile picture + daily usage (idempotent)
            try:
                cur.execute(
                    "ALTER TABLE users ADD COLUMN profile_picture_data MEDIUMTEXT NULL"
                )
            except OperationalError as e:
                if e.args[0] != 1060:
                    raise
            for column_ddl in (
                "ALTER TABLE users ADD COLUMN signup_ip VARCHAR(64) NULL",
                "ALTER TABLE users ADD COLUMN signup_country VARCHAR(64) NULL",
                "ALTER TABLE users ADD COLUMN signup_country_code VARCHAR(8) NULL",
                "ALTER TABLE users ADD COLUMN signup_city VARCHAR(128) NULL",
                # Subscription columns — everyone defaults to 'free'; webhook flips
                # this to 'regular' / 'advanced' after a successful Stripe checkout.
                "ALTER TABLE users ADD COLUMN subscription_tier VARCHAR(20) NOT NULL DEFAULT 'free'",
                "ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR(64) NULL",
                "ALTER TABLE users ADD COLUMN stripe_subscription_id VARCHAR(64) NULL",
                "ALTER TABLE users ADD COLUMN subscription_current_period_end TIMESTAMP NULL",
                # User-selectable UI theme. Stored on the account so it follows
                # the user across devices/browsers. Allowed values: 'light' | 'dark'.
                "ALTER TABLE users ADD COLUMN theme VARCHAR(10) NOT NULL DEFAULT 'light'",
                # Google Sign-In: stable subject id from the ID token ("sub" claim).
                "ALTER TABLE users ADD COLUMN google_sub VARCHAR(64) NULL",
                # NULL = password-based account; non-NULL = linked Google account.
                "ALTER TABLE users ADD COLUMN google_email VARCHAR(255) NULL",
                "ALTER TABLE users ADD COLUMN facebook_id VARCHAR(32) NULL",
                "ALTER TABLE users ADD COLUMN facebook_email VARCHAR(255) NULL",
                "ALTER TABLE users ADD COLUMN microsoft_sub VARCHAR(64) NULL",
                "ALTER TABLE users ADD COLUMN microsoft_email VARCHAR(255) NULL",
            ):
                try:
                    cur.execute(column_ddl)
                except OperationalError as e:
                    if e.args[0] != 1060:
                        raise
            # Index for webhook lookups (stripe_customer_id → user row)
            try:
                cur.execute(
                    "ALTER TABLE users ADD UNIQUE KEY uq_users_stripe_customer (stripe_customer_id)"
                )
            except OperationalError as e:
                # 1061 = duplicate key name, 1062 = dup value (unlikely at migration time)
                if e.args[0] not in (1061, 1062):
                    raise
            # Google-only accounts have no password — allow NULL on password_hash.
            try:
                cur.execute(
                    "ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL"
                )
            except OperationalError:
                # If the column is already nullable, MySQL may error — safe to ignore.
                pass
            try:
                cur.execute(
                    "ALTER TABLE users ADD UNIQUE KEY uq_users_google_sub (google_sub)"
                )
            except OperationalError as e:
                if e.args[0] not in (1061, 1062):
                    raise
            try:
                cur.execute(
                    "ALTER TABLE users ADD UNIQUE KEY uq_users_facebook_id (facebook_id)"
                )
            except OperationalError as e:
                if e.args[0] not in (1061, 1062):
                    raise
            try:
                cur.execute(
                    "ALTER TABLE users ADD UNIQUE KEY uq_users_microsoft_sub (microsoft_sub)"
                )
            except OperationalError as e:
                if e.args[0] not in (1061, 1062):
                    raise
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS user_usage_daily (
                    user_id INT UNSIGNED NOT NULL,
                    usage_date DATE NOT NULL,
                    seconds_spent INT UNSIGNED NOT NULL DEFAULT 0,
                    PRIMARY KEY (user_id, usage_date),
                    CONSTRAINT fk_user_usage_daily_user
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS chat_sessions (
                    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    user_id INT UNSIGNED NOT NULL,
                    title VARCHAR(255) NOT NULL DEFAULT 'Chat',
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    KEY idx_chat_sessions_user (user_id),
                    CONSTRAINT fk_chat_sessions_user
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    session_id INT UNSIGNED NOT NULL,
                    role ENUM('user', 'assistant') NOT NULL,
                    content MEDIUMTEXT NOT NULL,
                    confidence SMALLINT UNSIGNED NULL,
                    citations JSON NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    KEY idx_chat_messages_session (session_id),
                    CONSTRAINT fk_chat_messages_session
                        FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS password_reset_codes (
                    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    user_id INT UNSIGNED NOT NULL,
                    code_hash VARCHAR(255) NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    used TINYINT(1) NOT NULL DEFAULT 0,
                    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    KEY idx_password_reset_user (user_id),
                    CONSTRAINT fk_password_reset_user
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                """
            )
            # Persisted admin dashboard sessions. Survives backend restarts and
            # is shared across uvicorn workers, unlike the previous in-memory dict.
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS admin_sessions (
                    token VARCHAR(64) NOT NULL PRIMARY KEY,
                    expires_at TIMESTAMP NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    KEY idx_admin_sessions_expires (expires_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                """
            )
            # Persisted user sessions — replaces "send user_id in the body" with
            # a real opaque bearer token tied to the authenticated user.
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS user_sessions (
                    token VARCHAR(64) NOT NULL PRIMARY KEY,
                    user_id INT UNSIGNED NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    last_used_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    KEY idx_user_sessions_user (user_id),
                    KEY idx_user_sessions_expires (expires_at),
                    CONSTRAINT fk_user_sessions_user
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                """
            )
            # Per-user, per-month counters for tier-based quotas
            # (chat, upload, voice). Keyed by (user_id, period_start) so
            # we never accidentally double-count across months.
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS user_quota_usage (
                    user_id INT UNSIGNED NOT NULL,
                    period_start DATE NOT NULL,
                    chat_count INT UNSIGNED NOT NULL DEFAULT 0,
                    upload_count INT UNSIGNED NOT NULL DEFAULT 0,
                    voice_count INT UNSIGNED NOT NULL DEFAULT 0,
                    PRIMARY KEY (user_id, period_start),
                    CONSTRAINT fk_user_quota_user
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                """
            )
            # Idempotent column-add for installs that were created before
            # the voice quota was introduced. Wrapped in a try because
            # `IF NOT EXISTS` on `ADD COLUMN` only landed in MySQL 8.0.29
            # and we still support older 8.x patches in some envs.
            try:
                cur.execute(
                    "ALTER TABLE user_quota_usage "
                    "ADD COLUMN voice_count INT UNSIGNED NOT NULL DEFAULT 0"
                )
            except Exception:
                # Column already exists -- ignore.
                pass

            # ── In-app notifications ─────────────────────────────────
            # One row per delivered (or pending) notification. The
            # bell-icon dropdown reads this table; the reminder
            # scheduler writes to it twice a week. `kind` lets us
            # filter / group by reminder type without parsing copy.
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS notifications (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    user_id INT UNSIGNED NOT NULL,
                    kind VARCHAR(40) NOT NULL,
                    title VARCHAR(160) NOT NULL,
                    body TEXT NOT NULL,
                    link_url VARCHAR(255) NULL,
                    read_at TIMESTAMP NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    KEY idx_notifications_user_created (user_id, created_at DESC),
                    KEY idx_notifications_user_unread (user_id, read_at),
                    CONSTRAINT fk_notifications_user
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                """
            )

            # Per-user opt-out toggles. We auto-create a row with
            # everything enabled the first time a user is seen by the
            # scheduler / preferences endpoint, so missing rows imply
            # "all reminders on" rather than "all reminders off".
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS notification_preferences (
                    user_id INT UNSIGNED NOT NULL PRIMARY KEY,
                    study_email_enabled TINYINT(1) NOT NULL DEFAULT 1,
                    study_inapp_enabled TINYINT(1) NOT NULL DEFAULT 1,
                    upgrade_email_enabled TINYINT(1) NOT NULL DEFAULT 1,
                    upgrade_inapp_enabled TINYINT(1) NOT NULL DEFAULT 1,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP,
                    CONSTRAINT fk_notification_prefs_user
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                """
            )

            # Idempotency log for the scheduler. Before firing a
            # reminder batch we INSERT IGNORE here -- if the row
            # already exists, another worker (or a same-day restart)
            # already handled it and we skip.
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS reminder_runs (
                    kind VARCHAR(40) NOT NULL,
                    run_date DATE NOT NULL,
                    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    finished_at TIMESTAMP NULL,
                    sent_count INT UNSIGNED NOT NULL DEFAULT 0,
                    PRIMARY KEY (kind, run_date)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                """
            )
        conn.commit()
        logger.info("MySQL users table ready.")
    except Exception:
        logger.exception("Failed to init MySQL schema")
        raise
    finally:
        conn.close()


def fetch_one(query: str, params: tuple) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchone()
    finally:
        conn.close()


def fetch_all(query: str, params: tuple) -> list:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return list(cur.fetchall() or [])
    finally:
        conn.close()


def execute_insert(query: str, params: tuple) -> int:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(query, params)
            conn.commit()
            return int(cur.lastrowid)
    except IntegrityError as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


def execute_update(query: str, params: tuple) -> int:
    """Run an UPDATE/DELETE and return affected row count."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            affected = cur.execute(query, params)
            conn.commit()
            return int(affected or 0)
    finally:
        conn.close()
