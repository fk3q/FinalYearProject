/**
 * Saved chat sessions — proxied to FastAPI (`/api` → backend).
 *
 * All endpoints here require `Authorization: Bearer <token>` (the backend
 * `require_user` dependency rejects missing tokens with 401).
 */

import { authHeaders, clearSessionUser } from "./auth";

export function getApiBase() {
  return import.meta.env.VITE_API_URL ?? "";
}

function apiBase() {
  return getApiBase();
}

async function safeFetch(path, options) {
  const url = `${apiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = authHeaders(options?.headers || {});
  try {
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) clearSessionUser();
    return res;
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error("Couldn't reach the Laboracle server. Please try again.");
    }
    throw e;
  }
}

/** @returns {Promise<{ id: number, title: string, updated_at?: string }[]>} */
export async function listChatSessions(userId) {
  const res = await safeFetch(`/api/users/${userId}/chat-sessions`, { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    const msg = typeof detail === "string" ? detail : "Could not load chat history";
    throw new Error(msg);
  }
  return Array.isArray(data) ? data : [];
}

/**
 * @returns {Promise<{
 *   session_id: number,
 *   title: string,
 *   messages: { id: number, role: string, content: string, confidence?: number, citations: string[] }[]
 * }>}
 */
export async function getChatSession(userId, sessionId) {
  const res = await safeFetch(`/api/users/${userId}/chat-sessions/${sessionId}`, {
    method: "GET",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    const msg = typeof detail === "string" ? detail : "Could not load chat";
    throw new Error(msg);
  }
  return data;
}

export async function deleteChatSession(userId, sessionId) {
  const res = await safeFetch(`/api/users/${userId}/chat-sessions/${sessionId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = data.detail;
    const msg = typeof detail === "string" ? detail : "Could not delete chat";
    throw new Error(msg);
  }
}
