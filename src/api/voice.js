// Voice transcription helper -- POSTs an audio Blob (recorded via the
// browser's MediaRecorder) to the backend Whisper endpoint and returns
// the transcribed text. Mirrors the auth/error-message conventions used
// by the existing chat/upload helpers in this folder.

import { authHeaders } from "./auth";
import { getApiBase } from "./chatHistory";

// Polite ceiling on how long the user is allowed to record. Whisper
// itself accepts up to ~25 MB / clip but charging a single quota unit
// for a 10-minute monologue would feel unfair, so we auto-stop here.
export const MAX_RECORDING_SECONDS = 90;

// Audio MIME types we'll try, in preference order. Chrome / Firefox
// almost always land on the first; Safari falls back to mp4. Whisper
// accepts every entry in this list.
const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

export function pickRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null; // browser will choose its default
}

export async function transcribeAudio(blob) {
  if (!blob || !blob.size) {
    throw new Error("Empty recording.");
  }

  const form = new FormData();
  // Filename helps the backend / Whisper SDK pick a parser. Extension
  // tracks the blob's actual MIME so the audio bytes aren't mislabelled.
  const ext = extensionFromMime(blob.type);
  form.append("file", blob, `recording.${ext}`);

  const res = await fetch(`${getApiBase()}/api/voice/transcribe`, {
    method: "POST",
    // IMPORTANT: do NOT set Content-Type here -- the browser must add
    // the multipart boundary itself. authHeaders() with no extras only
    // appends Authorization, which is what we want.
    headers: authHeaders(),
    body: form,
  });

  if (!res.ok) {
    let detail = "";
    try {
      const data = await res.json();
      detail = data?.detail || "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    if (res.status === 429) {
      throw new Error(
        detail || "You've used up your voice transcriptions for this month."
      );
    }
    if (res.status === 413) {
      throw new Error(detail || "Recording is too large. Try a shorter clip.");
    }
    if (res.status === 503) {
      throw new Error(detail || "Voice transcription is currently unavailable.");
    }
    throw new Error(detail || `Transcription failed (HTTP ${res.status}).`);
  }

  const data = await res.json().catch(() => ({}));
  return (data?.text || "").trim();
}

function extensionFromMime(mime) {
  if (!mime) return "webm";
  const m = mime.toLowerCase();
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  return "webm";
}
