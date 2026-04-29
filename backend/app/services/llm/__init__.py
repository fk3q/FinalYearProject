"""
Multi-provider LLM dispatch layer.

Exposes a small, stable surface to the rest of the codebase:
  - ProviderClient: the async chat interface every backend must implement.
  - ModelInfo: metadata describing one user-pickable model.
  - registry: the singleton that knows which models exist, which require
    which API keys, and which subscription tier unlocks them.

`chat_service` calls only into the registry; individual provider modules
(openai_client, anthropic_client, gemini_client) are private detail.
"""

from .base import ProviderClient, ModelInfo
from .registry import registry, MODEL_GPT5, MODEL_OPUS, MODEL_SONNET, MODEL_GEMINI

__all__ = [
    "ProviderClient",
    "ModelInfo",
    "registry",
    "MODEL_GPT5",
    "MODEL_OPUS",
    "MODEL_SONNET",
    "MODEL_GEMINI",
]
