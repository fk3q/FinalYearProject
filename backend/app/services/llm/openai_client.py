"""
OpenAI provider adapter (GPT-5 et al.).

Uses the existing langchain-openai wrapper so we share the codebase's
established async patterns. ChatOpenAI supports either an OPENAI_API_KEY
in the environment or one passed explicitly -- we pass it explicitly so
the adapter never silently picks up a key from the host environment we
didn't intend.
"""

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from app.config import settings

from .base import ProviderClient


class OpenAIProvider(ProviderClient):
    provider = "openai"

    @property
    def is_configured(self) -> bool:
        return bool(settings.OPENAI_API_KEY)

    async def chat(
        self,
        *,
        model_id: str,
        system: str,
        user: str,
        max_tokens: int,
        temperature: float,
    ) -> str:
        # New ChatOpenAI per call so each request can target a different
        # model_id without keeping a forest of long-lived clients alive.
        # The wrapper is cheap to construct (no network roundtrip).
        llm = ChatOpenAI(
            model=model_id,
            temperature=temperature,
            max_tokens=max_tokens,
            openai_api_key=settings.OPENAI_API_KEY,
        )
        messages = [SystemMessage(content=system), HumanMessage(content=user)]
        resp = await llm.ainvoke(messages)
        return (resp.content or "").strip()
