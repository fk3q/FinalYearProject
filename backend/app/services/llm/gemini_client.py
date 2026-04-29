"""
Google provider adapter (Gemini).

Wraps `langchain-google-genai`'s ChatGoogleGenerativeAI. Same soft-fail
behaviour as the Anthropic adapter: missing key or missing package =
provider reports unconfigured and Gemini disappears from /api/models.
"""

from langchain_core.messages import HumanMessage, SystemMessage

try:
    from langchain_google_genai import ChatGoogleGenerativeAI  # type: ignore
    _IMPORT_ERROR: Exception | None = None
except Exception as _exc:  # pragma: no cover - install-time edge case
    ChatGoogleGenerativeAI = None  # type: ignore[assignment]
    _IMPORT_ERROR = _exc

from app.config import settings

from .base import ProviderClient


class GoogleProvider(ProviderClient):
    provider = "google"

    @property
    def is_configured(self) -> bool:
        return bool(settings.GOOGLE_API_KEY) and ChatGoogleGenerativeAI is not None

    async def chat(
        self,
        *,
        model_id: str,
        system: str,
        user: str,
        max_tokens: int,
        temperature: float,
    ) -> str:
        if ChatGoogleGenerativeAI is None:
            raise RuntimeError(
                f"langchain-google-genai is not installed: {_IMPORT_ERROR!r}"
            )

        llm = ChatGoogleGenerativeAI(
            model=model_id,
            temperature=temperature,
            max_output_tokens=max_tokens,
            google_api_key=settings.GOOGLE_API_KEY,
        )
        messages = [SystemMessage(content=system), HumanMessage(content=user)]
        resp = await llm.ainvoke(messages)
        return (resp.content or "").strip()
