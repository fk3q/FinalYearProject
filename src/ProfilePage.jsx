import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Upload,
  MessageSquare,
  User,
  Settings as SettingsIcon,
  CreditCard,
  LifeBuoy,
  Headphones,
} from "lucide-react";
import {
  fetchUsageQuota,
  fetchUserProfile,
  patchUserProfile,
  getSessionUser,
  mergeSessionUser,
} from "./api/auth";
import { createPortalSession } from "./api/payments";
import { useUsageTracker } from "./hooks/useUsageTracker";
import AccountSidebarBlock from "./components/AccountSidebarBlock";
import ChatSidebarBrandMark from "./components/ChatSidebarBrandMark";
import ThemeToggle from "./components/ThemeToggle";
import { useTheme } from "./contexts/ThemeContext";
import "./ProfilePage.css";

const TIER_LABEL = {
  free: "Free",
  regular: "Regular",
  advanced: "Advanced",
};

const TIER_DESCRIPTION = {
  free: "You're on the free plan. Upgrade to unlock more questions and features.",
  regular: "You're on the Regular plan.",
  advanced: "You're on the Advanced plan — unlimited access.",
};

function formatDuration(totalSeconds) {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

/** First day of next month, formatted as "May 1, 2026". */
function formatResetDate(periodStartIso) {
  if (!periodStartIso) return "";
  const start = new Date(`${periodStartIso}T00:00:00`);
  if (Number.isNaN(start.getTime())) return "";
  const next = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  return next.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Choose a colour bucket for the bar based on % full. */
function quotaTone(used, limit) {
  if (limit == null || limit <= 0) return "ok";
  const pct = (used / limit) * 100;
  if (pct >= 100) return "full";
  if (pct >= 80) return "warn";
  return "ok";
}

/**
 * Decide whether to show the "you're running low, upgrade?" CTA inside the
 * usage panel. Returns null if no nudge is needed (e.g. Advanced tier, or
 * both counters are well under their cap).
 */
function buildUpgradeNudge(usage) {
  if (!usage) return null;
  if (usage.tier === "advanced") return null;

  const pct = (c) =>
    c?.limit == null || c.limit <= 0 ? 0 : (c.used / c.limit) * 100;
  const top = Math.max(pct(usage.chat), pct(usage.upload));
  if (top < 80) return null;

  const nextTier = usage.tier === "free" ? "Regular" : "Advanced";
  const atLimit = top >= 100;
  return {
    tone: atLimit ? "full" : "warn",
    title: atLimit
      ? "You've hit your monthly limit"
      : "You're close to your monthly limit",
    body: atLimit
      ? `Upgrade to ${nextTier} to keep using Laboracle without waiting for the next reset.`
      : `Upgrade to ${nextTier} to unlock more questions and uploads before the reset.`,
    cta: `Upgrade to ${nextTier}`,
  };
}

/** One labelled progress bar inside the "Usage this month" panel. */
function QuotaRow({ label, used, limit }) {
  const unlimited = limit == null;
  const safeUsed = Math.max(0, used || 0);
  const pct = unlimited ? 0 : Math.min(100, (safeUsed / Math.max(1, limit)) * 100);
  const tone = quotaTone(safeUsed, limit);
  return (
    <div className="pf-quota-row">
      <div className="pf-quota-head">
        <span className="pf-quota-label">{label}</span>
        <span className="pf-quota-value">
          {unlimited ? (
            <>
              <strong>{safeUsed}</strong>
              <span className="pf-quota-of"> · unlimited</span>
            </>
          ) : (
            <>
              <strong>{safeUsed}</strong>
              <span className="pf-quota-of">/ {limit}</span>
            </>
          )}
        </span>
      </div>
      <div className="pf-quota-bar">
        <div
          className={`pf-quota-fill pf-quota-fill--${unlimited ? "unl" : tone}`}
          style={{ width: unlimited ? "100%" : `${pct}%` }}
        />
      </div>
    </div>
  );
}

const ProfilePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { applyTheme } = useTheme();
  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [savingPic, setSavingPic] = useState(false);
  const [picError, setPicError] = useState("");
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState("");
  const [usage, setUsage] = useState(null);
  const [usageError, setUsageError] = useState("");

  useUsageTracker();

  // Scroll to a section if the URL has a hash (e.g. /profile#settings).
  // Re-runs once `profile` is loaded so the target element actually exists.
  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.replace("#", "");
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [location.hash, profile]);

  useEffect(() => {
    const session = getSessionUser();
    if (!session?.id) {
      navigate("/login", { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchUserProfile(session.id);
        if (cancelled) return;
        setProfile(data);
        mergeSessionUser({
          profile_picture_url: data.profile_picture_url || undefined,
          theme: data.theme || undefined,
        });
        if (data.theme) applyTheme(data.theme);
      } catch (e) {
        if (!cancelled) setLoadError(e.message || "Could not load profile");
      }
      // Quota is fetched independently so a quota error doesn't block the
      // rest of the profile (and vice-versa).
      try {
        const q = await fetchUsageQuota(session.id);
        if (!cancelled) setUsage(q);
      } catch (e) {
        if (!cancelled) setUsageError(e.message || "Could not load usage");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, applyTheme]);

  const session = getSessionUser();

  const onPickImage = (e) => {
    const file = e.target.files?.[0];
    if (!file || !session?.id) return;
    if (!file.type.startsWith("image/")) {
      setPicError("Please choose an image file.");
      return;
    }
    if (file.size > 750 * 1024) {
      setPicError("Image must be under 750 KB.");
      return;
    }
    setPicError("");
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") return;
      setSavingPic(true);
      try {
        const updated = await patchUserProfile(session.id, {
          profile_picture_url: dataUrl,
        });
        setProfile(updated);
        mergeSessionUser({ profile_picture_url: updated.profile_picture_url });
      } catch (err) {
        setPicError(err.message || "Could not save picture");
      } finally {
        setSavingPic(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const openBillingPortal = async () => {
    if (!session?.id) return;
    setPortalError("");
    setPortalLoading(true);
    try {
      const { url } = await createPortalSession();
      if (url) {
        window.location.href = url;
      } else {
        throw new Error("No portal URL returned from the server.");
      }
    } catch (err) {
      setPortalError(err?.message || "Could not open subscription portal.");
      setPortalLoading(false);
    }
  };

  const clearPicture = async () => {
    if (!session?.id) return;
    setSavingPic(true);
    setPicError("");
    try {
      const updated = await patchUserProfile(session.id, {
        profile_picture_url: "",
      });
      setProfile(updated);
      mergeSessionUser({ profile_picture_url: undefined });
    } catch (err) {
      setPicError(err.message || "Could not remove picture");
    } finally {
      setSavingPic(false);
    }
  };

  return (
    <div className="pf-page">
      <aside className="pf-sidebar">
        <ChatSidebarBrandMark onClick={() => navigate("/")} />

        <nav className="pf-nav">
          <button className="pf-nav-item" onClick={() => navigate("/upload")}>
            <span className="pf-nav-icon"><Upload /></span> Upload Documents
          </button>
          <button className="pf-nav-item" onClick={() => navigate("/chat")}>
            <span className="pf-nav-icon"><MessageSquare /></span> Chat with AI
          </button>
        </nav>

        <div className="pf-section-label">Account</div>
        <nav className="pf-nav">
          <button
            className={`pf-nav-item ${!location.hash ? "active" : ""}`}
            onClick={() => navigate("/profile")}
          >
            <span className="pf-nav-icon"><User /></span> Profile
          </button>
          <button
            className={`pf-nav-item ${location.hash === "#settings" ? "active" : ""}`}
            onClick={() => navigate("/profile#settings")}
          >
            <span className="pf-nav-icon"><SettingsIcon /></span> Settings
          </button>
          <button
            className={`pf-nav-item ${location.hash === "#subscription" ? "active" : ""}`}
            onClick={() => navigate("/profile#subscription")}
          >
            <span className="pf-nav-icon"><CreditCard /></span> Subscription
          </button>
        </nav>

        <div className="pf-section-label">Help</div>
        <nav className="pf-nav">
          <button
            className="pf-nav-item"
            onClick={() => {
              window.location.href = "mailto:laboraclee@gmail.com?subject=Help%20centre%20enquiry";
            }}
          >
            <span className="pf-nav-icon"><LifeBuoy /></span> Help centre
          </button>
          <button
            className="pf-nav-item"
            onClick={() => {
              window.location.href = "mailto:laboraclee@gmail.com?subject=Support%20request";
            }}
          >
            <span className="pf-nav-icon"><Headphones /></span> Support
          </button>
        </nav>

        <AccountSidebarBlock variant="up" />

        <div className="pf-sidebar-footer">
          <button type="button" className="pf-secondary" onClick={() => navigate("/upload")}>
            Go to uploads →
          </button>
        </div>
      </aside>

      <main className="pf-main">
        <header className="pf-header">
          <p className="pf-kicker">You're signed in</p>
          <h1 className="pf-title">Your account</h1>
          <p className="pf-sub">
            View your profile details, photo, and how long you’ve used Laboracle today.
          </p>
        </header>

        {loadError && <div className="pf-alert pf-alert--error">{loadError}</div>}

        {!loadError && !profile && <div className="pf-loading">Loading profile…</div>}

        {profile && (
          <div className="pf-card">
            <div className="pf-hero">
              <div className="pf-avatar-wrap">
                {profile.profile_picture_url ? (
                  <img
                    className="pf-avatar-lg"
                    src={profile.profile_picture_url}
                    alt=""
                  />
                ) : (
                  <div className="pf-avatar-placeholder">
                    {(profile.first_name || "?").charAt(0)}
                    {(profile.last_name || "").charAt(0)}
                  </div>
                )}
              </div>
              <div className="pf-hero-text">
                <h2 className="pf-welcome">
                  Welcome back, {profile.first_name}
                </h2>
                <p className="pf-email">{profile.email}</p>
              </div>
            </div>

            <div className="pf-section">
              <h3 className="pf-section-title">Profile picture</h3>
              <p className="pf-muted">
                Choose a small image (under 750 KB). It is stored with your account.
              </p>
              <div className="pf-row">
                <label className="pf-file-btn">
                  {savingPic ? "Saving…" : "Upload photo"}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={onPickImage}
                    disabled={savingPic}
                  />
                </label>
                {profile.profile_picture_url && (
                  <button
                    type="button"
                    className="pf-link-btn"
                    onClick={clearPicture}
                    disabled={savingPic}
                  >
                    Remove photo
                  </button>
                )}
              </div>
              {picError && <p className="pf-field-error">{picError}</p>}
            </div>

            <div className="pf-section">
              <h3 className="pf-section-title">Your details</h3>
              <dl className="pf-dl">
                <div>
                  <dt>First name</dt>
                  <dd>{profile.first_name}</dd>
                </div>
                <div>
                  <dt>Last name</dt>
                  <dd>{profile.last_name}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{profile.email}</dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>{profile.phone}</dd>
                </div>
                <div>
                  <dt>Member since</dt>
                  <dd>
                    {profile.created_at
                      ? new Date(profile.created_at).toLocaleString()
                      : "—"}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="pf-section" id="subscription">
              <h3 className="pf-section-title">Subscription</h3>
              <div className="pf-sub-row">
                <div>
                  <div className={`pf-tier-badge pf-tier-${profile.subscription_tier || 'free'}`}>
                    {TIER_LABEL[profile.subscription_tier] || 'Free'} plan
                  </div>
                  <p className="pf-muted" style={{ marginTop: 8 }}>
                    {TIER_DESCRIPTION[profile.subscription_tier] || TIER_DESCRIPTION.free}
                  </p>
                </div>
                <div className="pf-sub-actions">
                  {profile.has_stripe_customer ? (
                    <button
                      type="button"
                      className="pf-file-btn"
                      onClick={openBillingPortal}
                      disabled={portalLoading}
                    >
                      {portalLoading ? 'Opening…' : 'Manage subscription'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="pf-file-btn"
                      onClick={() => navigate('/#pricing')}
                    >
                      See plans
                    </button>
                  )}
                </div>
              </div>
              {portalError && <p className="pf-field-error">{portalError}</p>}
            </div>

            <div className="pf-section" id="usage">
              <h3 className="pf-section-title">Usage this month</h3>
              <p className="pf-muted">
                Caps reset on the 1st of every month. Upgrade your plan if you
                need more headroom.
              </p>

              {usageError && (
                <p className="pf-field-error">{usageError}</p>
              )}

              {!usage && !usageError && (
                <p className="pf-muted">Loading usage…</p>
              )}

              {usage && (
                <>
                  <QuotaRow
                    label="AI questions"
                    used={usage.chat.used}
                    limit={usage.chat.limit}
                  />
                  <QuotaRow
                    label="Document uploads"
                    used={usage.upload.used}
                    limit={usage.upload.limit}
                  />

                  {(() => {
                    const nudge = buildUpgradeNudge(usage);
                    if (!nudge) return null;
                    return (
                      <div className={`pf-quota-nudge pf-quota-nudge--${nudge.tone}`}>
                        <div className="pf-quota-nudge-text">
                          <strong>{nudge.title}</strong>
                          <span>{nudge.body}</span>
                        </div>
                        <button
                          type="button"
                          className="pf-quota-nudge-btn"
                          onClick={() => navigate("/#pricing")}
                        >
                          {nudge.cta}
                        </button>
                      </div>
                    );
                  })()}

                  <p className="pf-muted pf-quota-foot">
                    Resets on {formatResetDate(usage.period_start)}.
                  </p>
                </>
              )}
            </div>

            <div className="pf-section" id="settings">
              <h3 className="pf-section-title">Settings</h3>
              <p className="pf-muted">
                Choose how Laboracle looks. Your preference is saved to your account
                and follows you on every device.
              </p>
              <ThemeToggle />
            </div>

            <div className="pf-section pf-usage">
              <h3 className="pf-section-title">Daily time on Laboracle</h3>
              <p className="pf-muted">
                Tracked while you keep Upload or Chat open (approximate).
              </p>
              <div className="pf-stat-big">
                {formatDuration(profile.daily_time_seconds || 0)}
              </div>
              <span className="pf-muted">today</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ProfilePage;
