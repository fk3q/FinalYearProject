import React from "react";
import { useNavigate } from "react-router-dom";
import { getSessionUser, logoutUser } from "../api/auth";
import "./AccountSidebarBlock.css";

function initialsFrom(user) {
  const a = (user?.first_name || "").trim().charAt(0);
  const b = (user?.last_name || "").trim().charAt(0);
  const s = (a + b).toUpperCase();
  if (s) return s;
  return (user?.email || "?").charAt(0).toUpperCase();
}

/**
 * Signed-in account strip for dashboard sidebars (upload / chat / profile).
 * @param {"up"|"cp"} variant — matches Upload (`up-*`) or Chat (`cp-*`) CSS prefixes.
 */
export default function AccountSidebarBlock({ variant = "up" }) {
  const navigate = useNavigate();
  const user = getSessionUser();
  const p = variant === "cp" ? "cp" : "up";

  if (!user) return null;

  const pic = user.profile_picture_url;
  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.email;

  const logout = async () => {
    await logoutUser();
    navigate("/login");
  };

  return (
    <div className={`${p}-account`}>
      <button
        type="button"
        className={`${p}-account-main`}
        onClick={() => navigate("/profile")}
        title="View your profile"
      >
        {pic ? (
          <img className={`${p}-account-avatar-img`} src={pic} alt="" />
        ) : (
          <span className={`${p}-account-avatar`}>{initialsFrom(user)}</span>
        )}
        <span className={`${p}-account-text`}>
          <span className={`${p}-account-label`}>Your account</span>
          <span className={`${p}-account-name`}>{displayName}</span>
        </span>
      </button>
      <button type="button" className={`${p}-account-logout`} onClick={logout}>
        Log out
      </button>
    </div>
  );
}
