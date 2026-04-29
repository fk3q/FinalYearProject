// Bell-icon dropdown that lives in the chat header.
//
// Shows an unread-count badge on the icon and opens a small panel
// listing recent notifications when clicked. Each row is clickable;
// clicking marks it read locally + on the server, and (if the row
// has a link_url) navigates to that route.
//
// Notification kinds drive the accent colour of the left-hand strip
// and the icon used in the row, so a "study_reminder" reads
// distinctly from an "upgrade_reminder" at a glance.

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BookOpen,
  CircleCheck,
  Crown,
  Info,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useNotifications } from "../hooks/useNotifications";

import "./NotificationBell.css";

// Maps backend `kind` strings to (icon, accent class) -- keep in sync
// with `notification_service.KIND_*`.
const KIND_META = {
  study_reminder: {
    Icon: BookOpen,
    accent: "nb-row--study",
  },
  upgrade_reminder: {
    Icon: Crown,
    accent: "nb-row--upgrade",
  },
  system: {
    Icon: Info,
    accent: "nb-row--system",
  },
};

function formatRelative(ts) {
  if (!ts) return "";
  const then = new Date(ts).getTime();
  if (!Number.isFinite(then)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 7 * 86_400) return `${Math.floor(diffSec / 86_400)}d ago`;
  // Past a week we just show the date -- nothing actionable about
  // "23 days ago", and the absolute date is more useful.
  return new Date(ts).toLocaleDateString();
}

const NotificationBell = ({ className = "" }) => {
  const {
    unreadCount,
    items,
    listLoading,
    listError,
    refreshList,
    markRead,
    markAllRead,
  } = useNotifications();

  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const navigate = useNavigate();

  // Outside-click + Escape close the dropdown.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Refresh the list every time the dropdown opens so newly-arrived
  // reminders show up without waiting for the next polling tick.
  useEffect(() => {
    if (open) refreshList();
  }, [open, refreshList]);

  const hasUnread = unreadCount > 0;
  const badgeText = useMemo(() => {
    if (!hasUnread) return "";
    return unreadCount > 9 ? "9+" : String(unreadCount);
  }, [hasUnread, unreadCount]);

  const handleRowClick = (n) => {
    if (!n.read_at) markRead(n.id);
    if (n.link_url) {
      // Internal link only -- the backend never persists external URLs
      // here, so we use react-router's navigate() to keep the SPA flow.
      setOpen(false);
      navigate(n.link_url);
    }
  };

  return (
    <div className={`nb-root ${className}`} ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`nb-trigger${hasUnread ? " nb-trigger--unread" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={
          hasUnread
            ? `Notifications (${unreadCount} unread)`
            : "Notifications"
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        title={
          hasUnread
            ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
            : "Notifications"
        }
      >
        <Bell size={18} />
        {hasUnread && <span className="nb-badge">{badgeText}</span>}
      </button>

      {open && (
        <div className="nb-panel" role="dialog" aria-label="Notifications">
          <div className="nb-panel__header">
            <span className="nb-panel__title">Notifications</span>
            {hasUnread && (
              <button
                type="button"
                className="nb-mark-all"
                onClick={markAllRead}
              >
                <CircleCheck size={14} />
                Mark all read
              </button>
            )}
          </div>

          <div className="nb-panel__body">
            {listLoading && items.length === 0 && (
              <div className="nb-empty">Loading…</div>
            )}

            {!listLoading && listError && (
              <div className="nb-empty nb-empty--error">{listError}</div>
            )}

            {!listLoading && !listError && items.length === 0 && (
              <div className="nb-empty">
                You're all caught up.
                <br />
                <span className="nb-empty__sub">
                  Reminders arrive twice a week.
                </span>
              </div>
            )}

            {items.map((n) => {
              const meta = KIND_META[n.kind] || KIND_META.system;
              const { Icon, accent } = meta;
              const isUnread = !n.read_at;
              return (
                <button
                  key={n.id}
                  type="button"
                  className={`nb-row ${accent}${
                    isUnread ? " nb-row--unread" : ""
                  }`}
                  onClick={() => handleRowClick(n)}
                >
                  <span className="nb-row__icon">
                    <Icon size={16} />
                  </span>
                  <span className="nb-row__content">
                    <span className="nb-row__title">{n.title}</span>
                    <span className="nb-row__body">{n.body}</span>
                    <span className="nb-row__time">
                      {formatRelative(n.created_at)}
                    </span>
                  </span>
                  {isUnread && <span className="nb-row__dot" aria-hidden />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
