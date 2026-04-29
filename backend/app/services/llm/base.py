"""
Provider-agnostic interfaces for the LLM dispatch layer.

`ProviderClient` is the async chat interface every vendor adapter must
implement. It deliberately accepts pre-rendered system + user strings
rather than message arrays so callers don't need to know which library
each backend is wrapping.

`ModelInfo` is the public-facing metadata returned by /api/models, so
the frontend can render labels, badges, and disabled states.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class ModelInfo:
    """Public-facing description of a single user-pickable model."""

    # Stable identifier the frontend stores in sessionStorage and sends
    # back in chat requests. Must NEVER change once shipped, even if the
    # underlying vendor model_id is rotated -- those rotations happen via
    # MODEL_ID_* env vars only.
    id: str

    # Friendly name shown in the picker (e.g. "GPT-5", "Claude Opus 4.7").
    label: str

    # One of: "openai", "anthropic", "google".
    provider: str

    # Lowest subscription tier that unlocks this model. Anyone on this
    # tier or higher can use it.
    min_tier: str  # "free" | "regular" | "advanced"

    # UI hint, mirrors the Cursor-style "Fast / Medium / Extra High"
    # badges. Purely cosmetic.
    speed_label: str  # "Fast" | "Medium" | "High" | "Extra High"

    # Brief one-liner shown in the picker so the user knows what each
    # model is best at without reading the docs.
    description: str

    # Filled in at request time by the registry: True iff the API key
    # for this provider is currently set. Keeps the picker honest --
    # we never offer a model the server can't reach.
    available: bool = True


class ProviderClient(ABC):
    """
    Vendor adapter contract. Implementations live next to this file
    (one per vendor) and are wired into the registry at module import.

    The interface is intentionally minimal: callers don't get to fiddle
    with vendor-specific knobs (system_prompt formatting, function
    calling, streaming) yet -- if any of those become necessary we'll
    extend this base, not bypass it.
    """

    #: The provider key this adapter handles. Used by the registry for
    #: O(1) lookups and to filter models when an API key is missing.
    provider: str

    @abstractmethod
    async def chat(
        self,
        *,
        model_id: str,
        system: str,
        user: str,
        max_tokens: int,
        temperature: float,
    ) -> str:
        """
        Send a single prompt to `model_id` (the vendor's exact model
        identifier, e.g. "gpt-5" or "claude-opus-4-7") and return the
        generated text.

        Implementations should raise an Exception (any) on failure;
        chat_service catches everything generically and surfaces a
        500 to the client. There's no need to invent a custom hierarchy.
        """
        raise NotImplementedError

    @property
    @abstractmethod
    def is_configured(self) -> bool:
        """
        True iff the provider has the credentials it needs to actually
        make a request. Checked once per /api/models call so missing
        keys hide the corresponding models in the picker rather than
        producing 500s mid-conversation.
        """
        raise NotImplementedError


def messages_to_pair(system: Optional[str], user: str) -> tuple[str, str]:
    """
    Tiny convenience for adapters that want pre-validated strings.
    Keeps the empty-system case from special-casing every adapter.
    """
    return (system or "", user or "")
