"""
Voice → text transcription via OpenAI Whisper.

Front-end records short clips (capped at ~90 s on the client) using the
browser's MediaRecorder API and POSTs the resulting audio Blob to
`/api/voice/transcribe`. We:

  1. Cap the upload size as a backstop against a client that ignores
     the duration limit or lies about Content-Length.
  2. Reject obviously-non-audio MIME types early.
  3. Stream the bytes into memory (small caps make this safe — Whisper's
     own server-side cap is 25 MB / clip).
  4. Hand the raw bytes to the Whisper API and return the transcript.

Quota accounting is handled by the route that calls into here, mirroring
how chat / upload quotas work elsewhere in the codebase.
"""

import io
import logging
from typing import Optional

from fastapi import UploadFile
from openai import AsyncOpenAI

from app.config import settings

logger = logging.getLogger(__name__)


# Hard cap on how big an uploaded audio clip can be. Whisper's own server
# cap is 25 MB; we set a much tighter limit because a 90 s opus clip is
# typically under 1 MB. Anything materially bigger is either a misuse or
# an unsupported format like uncompressed wav.
MAX_AUDIO_BYTES = 10 * 1024 * 1024  # 10 MB

# Whitelist of audio MIME prefixes we'll forward to Whisper. We don't
# enforce specific codecs because the browser picks (typically
# opus-in-webm on Chrome/Firefox, mp4/aac on Safari) and Whisper accepts
# all of these. The prefix check just stops obviously-wrong uploads.
_ALLOWED_AUDIO_PREFIXES = ("audio/", "video/webm", "video/mp4")

# Max concurrent Whisper calls — we don't enforce one here, but the
# route's slowapi limit + per-tier monthly quota together act as the
# upstream throttle.

# Whisper model name. As of writing OpenAI offers `whisper-1` for
# transcriptions; if the platform later renames it we just bump this
# constant rather than touching call sites.
_WHISPER_MODEL = "whisper-1"


# Lazy singleton — only instantiated once we have a valid API key.
_client: Optional[AsyncOpenAI] = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        if not settings.OPENAI_API_KEY:
            raise RuntimeError(
                "OPENAI_API_KEY is not set; voice transcription is disabled."
            )
        _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


def _is_supported_mime(content_type: Optional[str]) -> bool:
    if not content_type:
        # MediaRecorder sometimes omits the type; we still let it through
        # because the openai SDK will sniff the bytes and 400 if needed.
        return True
    ct = content_type.lower().split(";", 1)[0].strip()
    return any(ct.startswith(prefix) for prefix in _ALLOWED_AUDIO_PREFIXES)


async def _read_capped(file: UploadFile, cap: int) -> bytes:
    """
    Stream the upload into memory, raising ValueError if it exceeds
    `cap`. Mirrors the approach used by document_service so a client
    can't bypass the limit by lying about Content-Length.
    """
    buf = bytearray()
    chunk_size = 1024 * 64  # 64 KB chunks
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        buf.extend(chunk)
        if len(buf) > cap:
            raise ValueError(
                f"Audio file exceeds the {cap // (1024 * 1024)} MB cap."
            )
    return bytes(buf)


async def transcribe_audio(file: UploadFile, language: Optional[str] = None) -> str:
    """
    Run an UploadFile through OpenAI Whisper and return the resulting
    transcript text. `language` is an optional ISO-639-1 hint to improve
    accuracy when you already know what the user is speaking; pass None
    to let Whisper auto-detect.

    Raises:
        ValueError on validation failure (size cap, bad MIME).
        RuntimeError when the API key is missing.
        Other exceptions bubble up from the OpenAI client.
    """
    if not _is_supported_mime(file.content_type):
        raise ValueError(
            f"Unsupported audio MIME type: {file.content_type!r}. "
            "Expected one of: audio/*, video/webm, video/mp4."
        )

    audio_bytes = await _read_capped(file, MAX_AUDIO_BYTES)
    if not audio_bytes:
        raise ValueError("Empty audio upload.")

    # Whisper requires a filename to infer format. The browser typically
    # supplies one; if not, fabricate one from the MIME so the SDK can
    # still pick a sane file extension.
    filename = file.filename or _fallback_filename(file.content_type)

    client = _get_client()
    logger.info(
        "Transcribing %s (%d bytes, mime=%s) via Whisper",
        filename, len(audio_bytes), file.content_type,
    )

    # The openai SDK accepts a (name, bytes, mime) tuple in `file`.
    # `response_format="text"` gives us the bare transcript string
    # rather than a JSON envelope -- one less attribute access.
    transcript = await client.audio.transcriptions.create(
        model=_WHISPER_MODEL,
        file=(filename, io.BytesIO(audio_bytes), file.content_type or "audio/webm"),
        response_format="text",
        language=language,
    )

    # When response_format="text", the SDK returns a plain str.
    text = (transcript or "").strip()
    logger.info("Whisper returned %d chars", len(text))
    return text


def _fallback_filename(mime: Optional[str]) -> str:
    """Best-effort filename when the browser didn't send one."""
    if not mime:
        return "audio.webm"
    mime = mime.lower()
    if "ogg" in mime:
        return "audio.ogg"
    if "mp4" in mime or "aac" in mime or "m4a" in mime:
        return "audio.m4a"
    if "wav" in mime:
        return "audio.wav"
    if "mpeg" in mime or "mp3" in mime:
        return "audio.mp3"
    return "audio.webm"
