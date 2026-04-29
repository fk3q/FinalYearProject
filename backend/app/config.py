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

    # ── Anthropic (Claude Opus / Sonnet) ────────────────────────────────────
    # Leave blank to disable Anthropic-backed models -- they're filtered
    # out of the /api/models response when this is empty.
    ANTHROPIC_API_KEY: str = ""

    # ── Google (Gemini) ─────────────────────────────────────────────────────
    # Leave blank to disable Gemini-backed models. Same graceful-degradation
    # behaviour as the Anthropic key above.
    GOOGLE_API_KEY: str = ""

    # ── Embedding ────────────────────────────────────────────────────────────
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIMENSIONS: int = 1536

    # ── LLM (legacy single-model defaults; still used for embedding-only
    # paths and as the fallback when no model is requested explicitly) ──
    LLM_MODEL: str = "gpt-5"
    LLM_TEMPERATURE: float = 0.0
    LLM_MAX_TOKENS: int = 1000

    # ── Multi-provider model IDs ────────────────────────────────────────────
    # Override these in .env when vendors release new versions, so we don't
    # have to push a code change to upgrade. Each ID must match exactly
    # what the provider's SDK accepts -- the registry uses these verbatim.
    MODEL_ID_GPT5:           str = "gpt-5"
    MODEL_ID_CLAUDE_OPUS:    str = "claude-opus-4-7"
    MODEL_ID_CLAUDE_SONNET:  str = "claude-sonnet-4-6"
    MODEL_ID_GEMINI_PRO:     str = "gemini-2.5-pro"

    # The model used when a chat request omits an explicit `model` field.
    # Defaults to GPT-5 because OPENAI_API_KEY is the only key required for
    # day-1 deployment; Anthropic / Google keys can be added later without
    # breaking existing clients.
    DEFAULT_MODEL: str = "gpt-5"

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
    # Single admin account. **No defaults** — both must be set explicitly via
    # env so we can never accidentally ship a known username/password pair.
    # Outside development the app refuses to start unless both are non-empty
    # and the password is strong enough (see `Settings.validate_for_runtime`).
    ADMIN_USERNAME: str = ""
    ADMIN_PASSWORD: str = ""
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

    # ── Microsoft Sign-In ───────────────────────────────────────────────────
    # Application (client) ID from Microsoft Entra ID (Azure portal). Same
    # value is exposed to the frontend as VITE_MICROSOFT_CLIENT_ID. There is
    # no client secret — we use the public-client SPA flow with PKCE; the
    # backend verifies ID tokens against Microsoft's JWKS.
    MICROSOFT_CLIENT_ID: str = ""

    def get_cors_origins(self) -> List[str]:
        if isinstance(self.CORS_ORIGINS, str):
            return [o.strip() for o in self.CORS_ORIGINS.split(',') if o.strip()]
        return self.CORS_ORIGINS

    # ── Runtime guards ───────────────────────────────────────────────────────

    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() in {"production", "prod"}

    def validate_for_runtime(self) -> List[str]:
        """
        Return a list of human-readable problems that should block startup.
        Called once at app boot — see `main.py` lifespan.

        Production rules (only enforced when ENVIRONMENT=production):
          • ADMIN_USERNAME / ADMIN_PASSWORD must both be set.
          • ADMIN_PASSWORD must be at least 12 chars and not in a tiny
            blocklist of obvious values.
          • Stripe keys, if configured, must be live (`sk_live_…` / `pk_live_…`)
            and the webhook secret must be present.
          • CORS must not include any localhost / 127.0.0.1 origins.
        """
        problems: List[str] = []

        if not self.ADMIN_USERNAME or not self.ADMIN_PASSWORD:
            if self.is_production():
                problems.append(
                    "ADMIN_USERNAME and ADMIN_PASSWORD must both be set in production "
                    "(both are empty in the current environment)."
                )

        if self.is_production():
            weak_admin = {"123456", "password", "admin", "letmein", "qwerty"}
            if (
                self.ADMIN_PASSWORD
                and (len(self.ADMIN_PASSWORD) < 12 or self.ADMIN_PASSWORD.lower() in weak_admin)
            ):
                problems.append(
                    "ADMIN_PASSWORD is too weak for production "
                    "(must be 12+ characters and not a common value)."
                )

            if self.STRIPE_SECRET_KEY:
                if self.STRIPE_SECRET_KEY.startswith("sk_test_"):
                    problems.append(
                        "STRIPE_SECRET_KEY is a test key (sk_test_…). "
                        "Use sk_live_… in production or unset all Stripe vars to disable payments."
                    )
                if self.STRIPE_PUBLISHABLE_KEY.startswith("pk_test_"):
                    problems.append(
                        "STRIPE_PUBLISHABLE_KEY is a test key (pk_test_…). "
                        "Use pk_live_… in production."
                    )
                if not self.STRIPE_WEBHOOK_SECRET:
                    problems.append(
                        "STRIPE_WEBHOOK_SECRET is required when Stripe is enabled in production."
                    )

            for origin in self.get_cors_origins():
                low = origin.lower()
                if "localhost" in low or "127.0.0.1" in low:
                    problems.append(
                        f"CORS_ORIGINS includes a development origin in production: {origin!r}. "
                        "Restrict to your real domain(s) only."
                    )
                    break

        return problems


settings = Settings()
