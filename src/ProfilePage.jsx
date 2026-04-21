import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchUserProfile,
  patchUserProfile,
  getSessionUser,
  mergeSessionUser,
} from "./api/auth";
import { useUsageTracker } from "./hooks/useUsageTracker";
import AccountSidebarBlock from "./components/AccountSidebarBlock";
import "./ProfilePage.css";

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
  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [savingPic, setSavingPic] = useState(false);
  const [picError, setPicError] = useState("");

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
        });
      } catch (e) {
        if (!cancelled) setLoadError(e.message || "Could not load profile");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

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
          <span className="pf-brand-icon">C</span>
          <span className="pf-brand-name">Course Co-Pilot</span>
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
            View your profile details, photo, and how long you’ve used Course Co-Pilot today.
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

            <div className="pf-section pf-usage">
              <h3 className="pf-section-title">Daily time on Course Co-Pilot</h3>
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
