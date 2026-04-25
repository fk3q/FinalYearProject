/**
 * Auth API — proxied to FastAPI via Vite (`/api` → backend).
 */

const jsonHeaders = { "Content-Type": "application/json" };

export const USER_STORAGE_KEY = "laboracle_user";

export function saveSessionUser(user) {
  if (user && typeof user === "object") {
    sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
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
}

/** Merge fields into the stored session user (e.g. after updating profile photo). */
export function mergeSessionUser(partial) {
  const cur = getSessionUser();
  if (!cur || typeof partial !== "object") return;
  saveSessionUser({ ...cur, ...partial });
}

async function safeFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error(
        "Could not reach the server. If you use npm run dev, start the backend on port 8000. " +
          "If you use Docker, open http://localhost:3000 and run: docker compose up --build."
      );
    }
    throw e;
  }
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
  return data;
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
  return data;
}

export async function fetchUserById(userId) {
  const res = await safeFetch(`/api/users/${userId}`, { method: "GET" });
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
  const res = await safeFetch(`/api/users/${userId}/profile`, { method: "GET" });
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
        : new Error(
            "Profile could not be loaded. Rebuild the backend (docker compose up --build) so the /api/users/…/profile API is available."
          );
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
  const res = await safeFetch(`/api/users/${userId}/profile`, {
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

/** Record active time for today (ignored if request fails). */
export async function addUsageSeconds(userId, seconds) {
  try {
    const res = await safeFetch(`/api/users/${userId}/usage`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ seconds }),
    });
    if (!res.ok) return;
  } catch {
    /* offline / server down — ignore */
  }
}
