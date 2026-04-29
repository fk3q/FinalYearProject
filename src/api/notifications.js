// Notification API client.
//
// Backs the bell-icon dropdown + the (future) notification preferences
// section in Settings. All endpoints sit under /api/notifications and
// require the standard bearer token via authHeaders().
//
// The hook layer (useNotifications) handles polling + state -- this
// module is purely a thin fetch wrapper, so the same calls can be
// reused from the Settings page later without dragging hook lifecycle
// concerns in.

import { authHeaders } from "./auth";
import { getApiBase } from "./chatHistory";

async function _readError(res, fallback) {
  try {
    const data = await res.json();
    return data?.detail || fallback;
  } catch {
    return (await res.text().catch(() => "")) || fallback;
  }
}

export async function fetchNotifications(limit = 20) {
  const url = `${getApiBase()}/api/notifications?limit=${encodeURIComponent(limit)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      await _readError(res, `Failed to load notifications (HTTP ${res.status}).`)
    );
  }
  return res.json(); // { items: [...], unread_count: N }
}

export async function fetchUnreadCount() {
  const res = await fetch(`${getApiBase()}/api/notifications/unread-count`, {
    method: "GET",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      await _readError(res, `Failed to load unread count (HTTP ${res.status}).`)
    );
  }
  return res.json(); // { unread_count: N }
}

export async function markNotificationRead(notificationId) {
  const res = await fetch(
    `${getApiBase()}/api/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: "POST",
      headers: authHeaders(),
    }
  );
  if (!res.ok) {
    throw new Error(
      await _readError(res, `Failed to mark notification read (HTTP ${res.status}).`)
    );
  }
  return res.json();
}

export async function markAllNotificationsRead() {
  const res = await fetch(`${getApiBase()}/api/notifications/read-all`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      await _readError(res, `Failed to mark all read (HTTP ${res.status}).`)
    );
  }
  return res.json();
}

export async function fetchNotificationPreferences() {
  const res = await fetch(`${getApiBase()}/api/notifications/preferences`, {
    method: "GET",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      await _readError(res, `Failed to load preferences (HTTP ${res.status}).`)
    );
  }
  return res.json();
}

export async function updateNotificationPreferences(prefs) {
  const res = await fetch(`${getApiBase()}/api/notifications/preferences`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(prefs || {}),
  });
  if (!res.ok) {
    throw new Error(
      await _readError(res, `Failed to update preferences (HTTP ${res.status}).`)
    );
  }
  return res.json();
}
