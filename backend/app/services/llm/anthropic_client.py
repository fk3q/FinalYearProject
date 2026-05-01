"""
Anthropic provider adapter (Claude Opus / Sonnet).

Wraps `langchain-anthropic`'s ChatAnthropic so this adapter looks and
behaves identically to the OpenAI one from the registry's point of
view. If ANTHROPIC_API_KEY is unset we report `is_configured = False`
and the registry hides every Claude model from /api/models.
"""

from typing import Any, List, Optional

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

from .base import ProviderClient, parse_data_url


def _model_omits_temperature(model_id: str) -> bool:
    """
    True for Claude vendor model IDs that reject the `temperature` parameter.

    Anthropic deprecated temperature on the Claude 4 family (Opus 4.x,
    Sonnet 4.x, and any extended-thinking variant): the API returns a
    400 ``invalid_request_error`` with message
    `"temperature" is deprecated for this model.` if it's set.

    We don't try to be exhaustive — a substring check on the major
    vendor families covers what the registry exposes today and any
    future patch revision (4.7, 4.8, ...) without code changes.
    """
    mid = (model_id or "").lower()
    return (
        mid.startswith("claude-opus-4")
        or mid.startswith("claude-sonnet-4")
        or "thinking" in mid
    )


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
        images: Optional[List[str]] = None,
    ) -> str:
        if ChatAnthropic is None:
            raise RuntimeError(
                f"langchain-anthropic is not installed: {_IMPORT_ERROR!r}"
            )

        # Build the kwargs dict so we can omit `temperature` entirely
        # for model families that reject it. Passing temperature=None
        # to ChatAnthropic still sends `temperature` in the request
        # payload on some langchain-anthropic versions, so we don't
        # rely on that — the parameter just isn't passed at all when
        # the model doesn't accept it.
        kwargs: dict = {
            "model": model_id,
            "max_tokens": max_tokens,
            "anthropic_api_key": settings.ANTHROPIC_API_KEY,
        }
        if not _model_omits_temperature(model_id):
            kwargs["temperature"] = temperature

        llm = ChatAnthropic(**kwargs)

        if images:
            # Anthropic vision: each image becomes an `image` content block
            # with a base64 source. Skip anything that isn't a valid data URL
            # (a stray http URL would just confuse the API here).
            content: List[Any] = [{"type": "text", "text": user}]
            for url in images:
                parsed = parse_data_url(url)
                if not parsed:
                    continue
                mime, payload = parsed
                content.append(
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": mime,
                            "data": payload,
                        },
                    }
                )
            messages = [SystemMessage(content=system), HumanMessage(content=content)]
        else:
            messages = [SystemMessage(content=system), HumanMessage(content=user)]

        resp = await llm.ainvoke(messages)
        return (resp.content or "").strip()
