"""
Model registry — the single source of truth for "what models exist,
who's allowed to use them, and which provider handles each one".

Why a registry?
  · Adding a new model is a one-line change here, no edits to
    chat_service or the route layer.
  · The frontend picker reads this list (filtered by tier and key
    availability) so the UI never offers a model the backend can't
    actually serve.
  · check_access() is the only place the tier rules live, so quota /
    pricing changes don't drift across the codebase.
"""

from typing import Dict, List, Optional

from app.config import settings

from .anthropic_client import AnthropicProvider
from .base import ModelInfo, ProviderClient
from .gemini_client import GoogleProvider
from .openai_client import OpenAIProvider


# Stable, public model IDs. These are what the frontend stores in
# sessionStorage and posts back; the underlying vendor model_id (e.g.
# "claude-opus-4-7") lives separately in settings so we can rotate
# vendor versions without forcing every client to clear their cache.
MODEL_GPT5    = "gpt-5"
MODEL_OPUS    = "opus-4-7"
MODEL_SONNET  = "sonnet-4-6"
MODEL_GEMINI  = "gemini-2-5-pro"


# Tier ordering, lowest → highest. Used by `_tier_at_least`.
_TIER_ORDER = {"free": 0, "regular": 1, "advanced": 2}


class _Registry:
    """
    Internal singleton; importable as `registry` from this package.
    Holds one ProviderClient instance per vendor and the static list
    of ModelInfo descriptors.
    """

    def __init__(self) -> None:
        self._providers: Dict[str, ProviderClient] = {
            "openai":    OpenAIProvider(),
            "anthropic": AnthropicProvider(),
            "google":    GoogleProvider(),
        }

        # Mapping: public model_id → vendor model_id (read from settings
        # so it can be rotated via env var without a code change).
        self._vendor_id: Dict[str, str] = {
            MODEL_GPT5:    settings.MODEL_ID_GPT5,
            MODEL_OPUS:    settings.MODEL_ID_CLAUDE_OPUS,
            MODEL_SONNET:  settings.MODEL_ID_CLAUDE_SONNET,
            MODEL_GEMINI:  settings.MODEL_ID_GEMINI_PRO,
        }

        # The static catalogue. `available` is recomputed per request
        # in list_for_user() based on which API keys are populated.
        self._catalog: Dict[str, ModelInfo] = {
            MODEL_GEMINI: ModelInfo(
                id=MODEL_GEMINI,
                label="Gemini 2.5 Pro",
                provider="google",
                min_tier="free",
                speed_label="Fast",
                description="Google's flagship — fast and inexpensive. "
                "Great daily-driver for everyday questions.",
            ),
            MODEL_SONNET: ModelInfo(
                id=MODEL_SONNET,
                label="Claude Sonnet 4.6",
                provider="anthropic",
                min_tier="regular",
                speed_label="Medium",
                description="Anthropic's mid-tier — strong writing and "
                "reasoning at a moderate price.",
            ),
            MODEL_GPT5: ModelInfo(
                id=MODEL_GPT5,
                label="GPT-5",
                provider="openai",
                min_tier="advanced",
                speed_label="High",
                description="OpenAI's flagship — broadest capability, "
                "premium tier only.",
            ),
            MODEL_OPUS: ModelInfo(
                id=MODEL_OPUS,
                label="Claude Opus 4.7",
                provider="anthropic",
                min_tier="advanced",
                speed_label="Extra High",
                description="Anthropic's most powerful model — deep "
                "reasoning, slowest and priciest.",
            ),
        }

    # ── Lookups ───────────────────────────────────────────────────────

    def get(self, model_id: str) -> Optional[ModelInfo]:
        return self._catalog.get(model_id)

    def vendor_model_id(self, model_id: str) -> str:
        """
        Translate the public model_id ('opus-4-7') into the exact string
        the vendor SDK expects ('claude-opus-4-7'), reading it fresh from
        settings so .env overrides take effect without restarting code.
        """
        return self._vendor_id.get(model_id) or model_id

    def provider_for(self, model_id: str) -> ProviderClient:
        info = self.get(model_id)
        if info is None:
            raise ValueError(f"Unknown model_id: {model_id!r}")
        client = self._providers.get(info.provider)
        if client is None:  # pragma: no cover - registry is static
            raise RuntimeError(
                f"No provider client registered for {info.provider!r}"
            )
        return client

    # ── Tier / availability filtering ─────────────────────────────────

    def list_for_user(self, tier: str) -> List[ModelInfo]:
        """
        Models the user is allowed to *see* in the picker. Filters by:
          1. Tier: only models whose min_tier ≤ user's tier.
          2. Availability: providers whose API key is currently set
             (so we don't tease a model the backend can't serve).
        """
        user_rank = _TIER_ORDER.get((tier or "free").lower(), 0)
        out: List[ModelInfo] = []
        for info in self._catalog.values():
            if _TIER_ORDER[info.min_tier] > user_rank:
                continue
            available = self._providers[info.provider].is_configured
            # Recompute `available` -- the frozen dataclass forces a copy.
            out.append(
                ModelInfo(
                    id=info.id,
                    label=info.label,
                    provider=info.provider,
                    min_tier=info.min_tier,
                    speed_label=info.speed_label,
                    description=info.description,
                    available=available,
                )
            )
        # Sort by speed_label ladder so the picker reads predictably:
        # Fast → Medium → High → Extra High.
        rank = {"Fast": 0, "Medium": 1, "High": 2, "Extra High": 3}
        out.sort(key=lambda m: rank.get(m.speed_label, 99))
        return out

    def check_access(self, model_id: str, tier: str) -> Optional[str]:
        """
        Validate that `tier` is allowed to use `model_id` and that the
        underlying provider is reachable. Returns None on success, or a
        human-readable error string suitable for raising as an HTTP
        4xx detail.
        """
        info = self.get(model_id)
        if info is None:
            return f"Unknown model: {model_id!r}."

        user_rank = _TIER_ORDER.get((tier or "free").lower(), 0)
        if _TIER_ORDER[info.min_tier] > user_rank:
            return (
                f"{info.label} requires the {info.min_tier} plan or higher. "
                f"Upgrade to use this model."
            )

        if not self._providers[info.provider].is_configured:
            return (
                f"{info.label} is temporarily unavailable on this server "
                f"(API key not configured). Pick a different model."
            )

        return None

    def fallback_for(self, tier: str) -> Optional[ModelInfo]:
        """
        Best available model the user is allowed to use, or None if
        nothing is reachable. Used when a request omits an explicit
        model and the configured DEFAULT_MODEL is unreachable.
        """
        for info in self.list_for_user(tier):
            if info.available:
                return info
        return None


registry = _Registry()
