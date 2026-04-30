/**
 * Auth API — proxied to FastAPI via Vite (`/api` → backend).
 *
 * As of the auth-token rollout, every protected endpoint requires
 * `Authorization: Bearer <token>`. The token is issued by the backend on
 * login/register/oauth and lives in sessionStorage next to the user object.
 *
 * Token expiry is enforced server-side; the client clears the local copy
 * automatically on any 401 response (see `authedFetch` below).
 */

const jsonHeaders = { "Content-Type": "application/json" };

export const USER_STORAGE_KEY = "laboracle_user";
export const AUTH_TOKEN_KEY = "laboracle_auth_token";
export const AUTH_TOKEN_EXPIRES_KEY = "laboracle_auth_token_expires";

/** Fired when session user is saved or cleared — sidebar avatar refreshes. */
export const SESSION_USER_CHANGED_EVENT = "laboracle-session-changed";

export function saveSessionUser(user) {
  if (user && typeof user === "object") {
    sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(SESSION_USER_CHANGED_EVENT));
    }
  }
}

export function getSessionUser() {
  try {
    const raw = sessionStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSessionUser() {
  sessionStorage.removeItem(USER_STORAGE_KEY);
  clearAuthToken();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SESSION_USER_CHANGED_EVENT));
  }
}

/** Merge fields into the stored session user (e.g. after updating profile photo). */
export function mergeSessionUser(partial) {
  const cur = getSessionUser();
  if (!cur || typeof partial !== "object") return;
  saveSessionUser({ ...cur, ...partial });
}

/* ── Bearer token helpers ───────────────────────────────────────────────── */

export function saveAuthToken(token, expiresAt) {
  if (!token) return;
  sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  if (expiresAt) sessionStorage.setItem(AUTH_TOKEN_EXPIRES_KEY, expiresAt);
}

export function getAuthToken() {
  try {
    const token = sessionStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return null;
    const exp = sessionStorage.getItem(AUTH_TOKEN_EXPIRES_KEY);
    if (exp && new Date(exp).getTime() < Date.now()) {
      clearAuthToken();
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function clearAuthToken() {
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_EXPIRES_KEY);
}

export function authHeaders(extra = {}) {
  const token = getAuthToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
}

async function safeFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error(
        "Couldn't reach the Laboracle server. Please check your connection and try again."
      );
    }
    throw e;
  }
}

/**
 * fetch() wrapper that auto-attaches the bearer token and clears the local
 * session on 401 so a stale token never lingers.
 */
export async function authedFetch(url, options = {}) {
  const headers = authHeaders(options.headers || {});
  const res = await safeFetch(url, { ...options, headers });
  if (res.status === 401) {
    clearSessionUser();
  }
  return res;
}

function persistAuthSuccess(data) {
  if (data?.user) saveSessionUser(data.user);
  if (data?.token) saveAuthToken(data.token, data.expires_at);
  return data;
}

export async function registerUser({ firstName, lastName, phone, email, password, turnstileToken }) {
  const res = await safeFetch("/api/auth/register", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      first_name: firstName,
      last_name: lastName,
      phone,
      email,
      password,
      turnstile_token: turnstileToken || null,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    const msg =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg || d).join(" ")
          : res.statusText;
    throw new Error(msg || "Registration failed");
  }
  return persistAuthSuccess(data);
}

export async function requestPasswordReset({ email }) {
  const res = await safeFetch("/api/auth/forgot-password", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    const msg = typeof detail === "string" ? detail : "Could not start password reset";
    throw new Error(msg);
  }
  return data;
}

export async function resetPassword({ email, code, newPassword }) {
  const res = await safeFetch("/api/auth/reset-password", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ email, code, new_password: newPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    const msg = typeof detail === "string" ? detail : "Could not reset password";
    throw new Error(msg);
  }
  return data;
}

export async function loginUser({ email, password }) {
  const res = await safeFetch("/api/auth/login", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    const msg = typeof detail === "string" ? detail : "Invalid email or password";
    throw new Error(msg);
  }
  return persistAuthSuccess(data);
}

export async function logoutUser() {
  // Best-effort revoke on the server; the local clear happens regardless so
  // the user is logged out even if the server call fails.
  try {
    await safeFetch("/api/auth/logout", {
      method: "POST",
      headers: authHeaders(),
    });
  } catch {
    /* ignore */
  } finally {
    clearSessionUser();
  }
}

export async function googleSignIn({ credential }) {
  const res = await safeFetch("/api/auth/google", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ credential }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    const msg =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg || d).join(" ")
          : res.statusText;
    throw new Error(msg || "Google sign-in failed");
  }
  return persistAuthSuccess(data);
}

export async function facebookSignIn({ accessToken }) {
  const res = await safeFetch("/api/auth/facebook", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ access_token: accessToken }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    const msg =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg || d).join(" ")
          : res.statusText;
    throw new Error(msg || "Facebook sign-in failed");
  }
  return persistAuthSuccess(data);
}

export async function microsoftSignIn({ idToken }) {
  const res = await safeFetch("/api/auth/microsoft", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ id_token: idToken }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    const msg =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg || d).join(" ")
          : res.statusText;
    throw new Error(msg || "Microsoft sign-in failed");
  }
  return persistAuthSuccess(data);
}

export async function fetchUserById(userId) {
  const res = await authedFetch(`/api/users/${userId}`, { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    const msg = typeof detail === "string" ? detail : "Could not load profile";
    throw new Error(msg);
  }
  return data;
}

/** Full profile: name, email, stats, optional profile picture data URL. */
export async function fetchUserProfile(userId) {
  const res = await authedFetch(`/api/users/${userId}/profile`, { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data;

  const detail = data.detail;
  const msg = typeof detail === "string" ? detail : "Could not load profile";

  // Older backend images only register GET /api/users/{id}, not .../profile — FastAPI then returns 404 with detail "Not Found".
  if (res.status === 404 && detail === "Not Found") {
    try {
      const basic = await fetchUserById(userId);
      return {
        ...basic,
        profile_picture_url: undefined,
        daily_time_seconds: 0,
      };
    } catch (fallbackErr) {
      throw fallbackErr instanceof Error
        ? fallbackErr
        : new Error("Profile could not be loaded.");
    }
  }

  throw new Error(msg);
}

/**
 * Patch any subset of profile fields. Only the keys you pass are sent — the
 * backend uses `model_fields_set` to distinguish "field omitted" from
 * "field explicitly null", so a theme-only update will not wipe the picture.
 */
export async function patchUserProfile(userId, payload) {
  const body = {};
  if (Object.prototype.hasOwnProperty.call(payload, "profile_picture_url")) {
    body.profile_picture_url = payload.profile_picture_url;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "theme")) {
    body.theme = payload.theme;
  }
  const res = await authedFetch(`/api/users/${userId}/profile`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    const msg = typeof detail === "string" ? detail : "Could not update profile";
    throw new Error(msg);
  }
  return data;
}

/**
 * Fetch the signed-in user's chat/upload quota usage for the current
 * calendar month. Returns
 *   { tier, period_start, chat: {used, limit}, upload: {used, limit} }
 * where `limit: null` means unlimited (advanced tier).
 */
export async function fetchUsageQuota(userId) {
  const res = await authedFetch(`/api/users/${userId}/usage-quota`, { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    const msg = typeof detail === "string" ? detail : "Could not load usage";
    throw new Error(msg);
  }
  return data;
}

/** Record active time for today (ignored if request fails). */
export async function addUsageSeconds(userId, seconds) {
  if (!getAuthToken()) return; // Skip when signed out — endpoint requires auth.
  try {
    const res = await authedFetch(`/api/users/${userId}/usage`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ seconds }),
    });
    if (!res.ok) return;
  } catch {
    /* offline / server down — ignore */
  }
}
