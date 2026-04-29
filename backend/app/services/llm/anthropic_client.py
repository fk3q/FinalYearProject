"""
Anthropic provider adapter (Claude Opus / Sonnet).

Wraps `langchain-anthropic`'s ChatAnthropic so this adapter looks and
behaves identically to the OpenAI one from the registry's point of
view. If ANTHROPIC_API_KEY is unset we report `is_configured = False`
and the registry hides every Claude model from /api/models.
"""

from langchain_core.messages import HumanMessage, SystemMessage

try:
    # Imported lazily-ish: keep the failure mode soft so a missing
    # langchain-anthropic install (e.g. on a half-baked dev box) just
    # disables Claude rather than crashing the whole API on boot.
    from langchain_anthropic import ChatAnthropic  # type: ignore
    _IMPORT_ERROR: Exception | None = None
except Exception as _exc:  # pragma: no cover - install-time edge case
    ChatAnthropic = None  # type: ignore[assignment]
    _IMPORT_ERROR = _exc

from app.config import settings

from .base import ProviderClient


class AnthropicProvider(ProviderClient):
    provider = "anthropic"

    @property
    def is_configured(self) -> bool:
        return bool(settings.ANTHROPIC_API_KEY) and ChatAnthropic is not None

    async def chat(
        self,
        *,
        model_id: str,
        system: str,
        user: str,
        max_tokens: int,
        temperature: float,
    ) -> str:
        if ChatAnthropic is None:
            raise RuntimeError(
                f"langchain-anthropic is not installed: {_IMPORT_ERROR!r}"
            )

        llm = ChatAnthropic(
            model=model_id,
            temperature=temperature,
            max_tokens=max_tokens,
            anthropic_api_key=settings.ANTHROPIC_API_KEY,
        )
        # ChatAnthropic accepts the same SystemMessage/HumanMessage
        # interface as ChatOpenAI thanks to LangChain's standardisation.
        messages = [SystemMessage(content=system), HumanMessage(content=user)]
        resp = await llm.ainvoke(messages)
        return (resp.content or "").strip()
