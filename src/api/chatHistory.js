/**
 * Saved chat sessions — proxied to FastAPI (`/api` → backend).
 */

export function getApiBase() {
  return import.meta.env.VITE_API_URL ?? "";
}

function apiBase() {
  return getApiBase();
}

async function safeFetch(path, options) {
  const url = `${apiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  try {
    return await fetch(url, options);
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error(
        "Could not reach the server. Start the backend or open the app via the dev server with API proxy."
      );
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
