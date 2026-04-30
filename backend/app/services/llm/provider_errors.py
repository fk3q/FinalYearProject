"""
Detect vendor-specific errors buried in LangChain / SDK exception chains.

Anthropic often raises wrapped errors where the useful text lives on a cause
or inside a `.body` dict — a plain ``str(exc)`` from the route layer misses it.
"""

from __future__ import annotations

from typing import Optional


def _chunks_from_exception(exc: BaseException) -> list[str]:
    out: list[str] = []
    seen: set[int] = set()
    depth = 0
    cur: Optional[BaseException] = exc
    while cur is not None and depth < 8:
        oid = id(cur)
        if oid in seen:
            break
        seen.add(oid)
        out.append(repr(cur))
        out.append(str(cur))

        body = getattr(cur, "body", None)
        if body is not None:
            out.append(str(body))

        resp = getattr(cur, "response", None)
        if resp is not None:
            text_attr = getattr(resp, "text", None)
            if callable(text_attr):
                try:
                    out.append(str(text_attr()))
                except Exception:
                    pass
            json_attr = getattr(resp, "json", None)
            if callable(json_attr):
                try:
                    out.append(str(json_attr()))
                except Exception:
                    pass

        cur = cur.__cause__ or cur.__context__
        depth += 1

    return out


def anthropic_reports_insufficient_credits(exc: BaseException) -> bool:
    """True when Anthropic's API rejected the call for low / exhausted credits."""
    blob = " ".join(_chunks_from_exception(exc)).lower()
    if "credit balance" in blob and "too low" in blob:
        return True
    if "insufficient" in blob and "credit" in blob and "anthropic" in blob:
        return True
    if "invalid_request_error" in blob and "credit balance" in blob:
        return True
    return False


def anthropic_insufficient_credit_user_message() -> str:
    return (
        "Claude could not run: Anthropic reports insufficient credits for the "
        "API key used by this server. If your Anthropic console shows a balance, "
        "that credit belongs to the organization tied to this key — generate a "
        "new key under the same org (Console → API keys) or update "
        "ANTHROPIC_API_KEY on the server. You can use another model "
        "(for example GPT-4o) in the meantime."
    )
