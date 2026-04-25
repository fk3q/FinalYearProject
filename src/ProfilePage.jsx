import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchUserProfile,
  patchUserProfile,
  getSessionUser,
  mergeSessionUser,
} from "./api/auth";
import { createPortalSession } from "./api/payments";
import { useUsageTracker } from "./hooks/useUsageTracker";
import AccountSidebarBlock from "./components/AccountSidebarBlock";
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

const ProfilePage = () => {
  const navigate = useNavigate();
  const { applyTheme } = useTheme();
  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [savingPic, setSavingPic] = useState(false);
  const [picError, setPicError] = useState("");
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState("");

  useUsageTracker();

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
      const { url } = await createPortalSession({ userId: session.id });
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
        <div className="pf-brand" onClick={() => navigate("/")}>
          <img src="/laboracle-logo.png" alt="Laboracle" className="pf-brand-logo" />
        </div>

        <nav className="pf-nav">
          <button className="pf-nav-item" onClick={() => navigate("/upload")}>
            <span className="pf-nav-icon">↑</span> Upload Documents
          </button>
          <button className="pf-nav-item" onClick={() => navigate("/chat")}>
            <span className="pf-nav-icon">●</span> Chat with AI
          </button>
          <button className="pf-nav-item active">
            <span className="pf-nav-icon">◎</span> My profile
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

            <div className="pf-section">
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

            <div className="pf-section">
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
