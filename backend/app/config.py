"""
Configuration settings loaded from environment variables / .env file.
MongoDB references removed — FAISS is used for vector storage.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        env_parse_none_str='null',
    )

    # ── OpenAI ──────────────────────────────────────────────────────────────
    OPENAI_API_KEY: str = ""

    # ── Embedding ────────────────────────────────────────────────────────────
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIMENSIONS: int = 1536

    # ── LLM ─────────────────────────────────────────────────────────────────
    LLM_MODEL: str = "gpt-4o"
    LLM_TEMPERATURE: float = 0.0
    LLM_MAX_TOKENS: int = 1000

    # ── Chunking ─────────────────────────────────────────────────────────────
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 200

    # ── Retrieval ────────────────────────────────────────────────────────────
    TOP_K: int = 5

    # ── MySQL (user accounts) ─────────────────────────────────────────────────
    MYSQL_HOST: str = "127.0.0.1"
    MYSQL_PORT: int = 3306
    MYSQL_USER: str = "root"
    MYSQL_PASSWORD: str = ""
    MYSQL_DATABASE: str = "course_copilot"

    # ── Server ───────────────────────────────────────────────────────────────
    ENVIRONMENT: str = "development"
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3001,http://localhost:5173"

    # ── Email (password reset) ────────────────────────────────────────────────
    # Leave empty to skip real email sending; the 6-digit code is then logged to
    # the backend console so you can still test the flow in development.
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True
    SMTP_FROM_EMAIL: str = ""
    SMTP_FROM_NAME: str = "Laboracle"
    APP_NAME: str = "Laboracle"

    # ── Admin dashboard ───────────────────────────────────────────────────────
    # Single hardcoded admin account. Override via env vars in production.
    ADMIN_USERNAME: str = "fk3q"
    ADMIN_PASSWORD: str = "123456"
    ADMIN_TOKEN_TTL_HOURS: int = 8

    # ── Stripe / Payments ─────────────────────────────────────────────────────
    # Leave all blank to disable the payment routes — the app still runs.
    # For test mode, use keys starting with `sk_test_` / `pk_test_`.
    STRIPE_SECRET_KEY: str = ""
    STRIPE_PUBLISHABLE_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    # Price IDs from your Stripe dashboard (Products → Prices). One per tier/cycle.
    STRIPE_PRICE_REGULAR_MONTHLY: str = ""
    STRIPE_PRICE_REGULAR_YEARLY: str = ""
    STRIPE_PRICE_ADVANCED_MONTHLY: str = ""
    STRIPE_PRICE_ADVANCED_YEARLY: str = ""
    # Where Stripe should send the user after checkout (must include scheme).
    # Default assumes the Docker frontend at http://localhost:3000.
    FRONTEND_URL: str = "http://localhost:3000"

    # ── Cloudflare Turnstile (signup CAPTCHA) ─────────────────────────────────
    # Leave blank to disable captcha verification (useful for local dev without
    # a Turnstile account). The frontend site key is configured at build time
    # via VITE_TURNSTILE_SITE_KEY in docker-compose.yml.
    TURNSTILE_SECRET_KEY: str = ""

    # ── Google Sign-In ────────────────────────────────────────────────────────
    # OAuth 2.0 Web Client ID from Google Cloud Console (ends in
    # .apps.googleusercontent.com). Used by the backend to verify ID tokens.
    GOOGLE_OAUTH_CLIENT_ID: str = ""

    # ── Facebook Login ──────────────────────────────────────────────────────
    # App ID is public (also passed to the frontend as VITE_FACEBOOK_APP_ID).
    # App secret stays on the server only — used to verify access tokens.
    FACEBOOK_APP_ID: str = ""
    FACEBOOK_APP_SECRET: str = ""

    def get_cors_origins(self) -> List[str]:
        if isinstance(self.CORS_ORIGINS, str):
            return [o.strip() for o in self.CORS_ORIGINS.split(',') if o.strip()]
        return self.CORS_ORIGINS


settings = Settings()
