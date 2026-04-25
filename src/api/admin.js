/**
 * Admin dashboard API — separate token stored in sessionStorage.
 */

const ADMIN_TOKEN_KEY = "laboracle_admin_token";
const ADMIN_TOKEN_EXPIRES_KEY = "laboracle_admin_token_expires";

function jsonHeaders() {
  return { "Content-Type": "application/json" };
}

function authHeaders() {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getAdminToken() {
  try {
    const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    const exp = sessionStorage.getItem(ADMIN_TOKEN_EXPIRES_KEY);
    if (!token) return null;
    if (exp && new Date(exp).getTime() < Date.now()) {
      clearAdminToken();
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function saveAdminToken(token, expiresAt) {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  if (expiresAt) sessionStorage.setItem(ADMIN_TOKEN_EXPIRES_KEY, expiresAt);
}

export function clearAdminToken() {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_TOKEN_EXPIRES_KEY);
}

async function safeFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error(
      "Could not reach the server. Make sure the backend is running on port 8000."
    );
  }
}

export async function adminLogin({ username, password }) {
  const res = await safeFetch("/api/admin/login", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    throw new Error(typeof detail === "string" ? detail : "Login failed");
  }
  saveAdminToken(data.token, data.expires_at);
  return data;
}

export async function adminLogout() {
  try {
    await safeFetch("/api/admin/logout", {
      method: "POST",
      headers: { ...authHeaders() },
    });
  } catch {
    /* ignore */
  } finally {
    clearAdminToken();
  }
}

export async function getAdminStats() {
  const res = await safeFetch("/api/admin/stats", {
    method: "GET",
    headers: { ...authHeaders() },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearAdminToken();
    throw new Error("Session expired. Please sign in again.");
  }
  if (!res.ok) {
    const detail = data.detail;
    throw new Error(typeof detail === "string" ? detail : "Could not load stats");
  }
  return data;
}

export async function getAdminUsers() {
  const res = await safeFetch("/api/admin/users", {
    method: "GET",
    headers: { ...authHeaders() },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearAdminToken();
    throw new Error("Session expired. Please sign in again.");
  }
  if (!res.ok) {
    const detail = data.detail;
    throw new Error(typeof detail === "string" ? detail : "Could not load users");
  }
  return data;
}

export async function backfillGeo() {
  const res = await safeFetch("/api/admin/backfill-geo", {
    method: "POST",
    headers: { ...authHeaders() },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearAdminToken();
    throw new Error("Session expired. Please sign in again.");
  }
  if (!res.ok) {
    const detail = data.detail;
    throw new Error(typeof detail === "string" ? detail : "Backfill failed");
  }
  return data;
}
