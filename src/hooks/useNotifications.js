// React hook for the bell-icon dropdown.
//
// Owns three pieces of state:
//   1. The unread badge count -- polled cheaply every BADGE_POLL_MS so
//      newly-created notifications appear without a page reload.
//   2. The recent-items list -- fetched lazily the first time the
//      dropdown opens, then refreshed each time it's reopened.
//   3. Optimistic mark-as-read -- we update local state immediately
//      and rollback if the server rejects, so the dropdown feels
//      snappy even on slow links.
//
// Polling is paused when the tab is hidden (visibilitychange) to keep
// the API quiet for users with the chat open in a background tab.

import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "../api/notifications";
import { getAuthToken } from "../api/auth";

// 60 seconds is a deliberate compromise: long enough that 1k users
// don't hammer the backend, short enough that the badge feels live
// after the cron fires twice a week.
const BADGE_POLL_MS = 60_000;

export function useNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const pollRef = useRef(null);

  // ── Badge polling ──────────────────────────────────────────────
  const refreshUnreadCount = useCallback(async () => {
    if (!getAuthToken()) return; // signed out -- nothing to poll
    try {
      const data = await fetchUnreadCount();
      setUnreadCount(Number(data?.unread_count) || 0);
    } catch {
      /* swallow — polling failures shouldn't toast the user */
    }
  }, []);

  useEffect(() => {
    if (!getAuthToken()) return undefined;

    // Eager fetch on mount so the badge isn't blank for a full minute.
    refreshUnreadCount();

    function tick() {
      if (document.visibilityState === "visible") refreshUnreadCount();
    }

    pollRef.current = window.setInterval(tick, BADGE_POLL_MS);
    document.addEventListener("visibilitychange", tick);

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refreshUnreadCount]);

  // ── Lazy list fetch ────────────────────────────────────────────
  // Called by the bell component when the dropdown opens. Returns a
  // promise so callers can await before rendering, but local state
  // is updated regardless.
  const refreshList = useCallback(async () => {
    if (!getAuthToken()) return;
    setListLoading(true);
    setListError("");
    try {
      const data = await fetchNotifications(20);
      setItems(Array.isArray(data?.items) ? data.items : []);
      setUnreadCount(Number(data?.unread_count) || 0);
    } catch (err) {
      setListError(err?.message || "Couldn't load notifications.");
    } finally {
      setListLoading(false);
    }
  }, []);

  // ── Optimistic mark-as-read for a single row ───────────────────
  const markRead = useCallback(async (notificationId) => {
    let snapshot = null;
    setItems((prev) => {
      snapshot = prev;
      return prev.map((n) =>
        n.id === notificationId && !n.read_at
          ? { ...n, read_at: new Date().toISOString() }
          : n
      );
    });
    setUnreadCount((c) => Math.max(0, c - 1));

    try {
      await markNotificationRead(notificationId);
    } catch {
      // Roll back -- could be transient network failure.
      if (snapshot) setItems(snapshot);
      // Re-fetch authoritative count just to be safe.
      refreshUnreadCount();
    }
  }, [refreshUnreadCount]);

  // ── Optimistic mark-all ────────────────────────────────────────
  const markAllRead = useCallback(async () => {
    let snapshot = null;
    setItems((prev) => {
      snapshot = prev;
      const now = new Date().toISOString();
      return prev.map((n) => (n.read_at ? n : { ...n, read_at: now }));
    });
    setUnreadCount(0);

    try {
      await markAllNotificationsRead();
    } catch {
      if (snapshot) setItems(snapshot);
      refreshUnreadCount();
    }
  }, [refreshUnreadCount]);

  return {
    unreadCount,
    items,
    listLoading,
    listError,
    refreshList,
    refreshUnreadCount,
    markRead,
    markAllRead,
  };
}
