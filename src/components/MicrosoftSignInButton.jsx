import React, { useCallback, useRef, useState } from "react";
import { PublicClientApplication, BrowserAuthError } from "@azure/msal-browser";
import "./MicrosoftSignInButton.css";

const CLIENT_ID = (import.meta.env.VITE_MICROSOFT_CLIENT_ID || "").trim();

// Multi-tenant authority — accepts personal Microsoft accounts (Outlook,
// Hotmail, Live) and any work or school account in Microsoft Entra ID.
const AUTHORITY = "https://login.microsoftonline.com/common";

let _msalInstance = null;
let _msalInitPromise = null;

function getMsalInstance() {
  if (!CLIENT_ID) return null;
  if (_msalInstance) return _msalInstance;
  _msalInstance = new PublicClientApplication({
    auth: {
      clientId: CLIENT_ID,
      authority: AUTHORITY,
      redirectUri: window.location.origin,
    },
    cache: {
      // Token survives only for the tab — same trade-off as the Google + Facebook flows.
      cacheLocation: "sessionStorage",
      storeAuthStateInCookie: false,
    },
  });
  return _msalInstance;
}

async function ensureMsalReady() {
  const msal = getMsalInstance();
  if (!msal) return null;
  if (!_msalInitPromise) {
    _msalInitPromise = msal.initialize().catch((e) => {
      _msalInitPromise = null;
      throw e;
    });
  }
  await _msalInitPromise;
  return msal;
}

const MicrosoftLogo = () => (
  <svg
    className="ms-signin-btn__icon"
    width="20"
    height="20"
    viewBox="0 0 21 21"
    aria-hidden="true"
    focusable="false"
  >
    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
  </svg>
);

export default function MicrosoftSignInButton({ onIdToken, disabled }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const inFlight = useRef(false);

  const onClick = useCallback(async () => {
    if (!CLIENT_ID || inFlight.current) return;
    inFlight.current = true;
    setErr("");
    setLoading(true);
    try {
      const msal = await ensureMsalReady();
      if (!msal) {
        setErr("Microsoft Sign-In is not configured.");
        return;
      }
      const result = await msal.loginPopup({
        scopes: ["openid", "profile", "email"],
        prompt: "select_account",
      });
      const idToken = result?.idToken;
      if (!idToken) {
        setErr("Could not get a Microsoft session. Please try again.");
        return;
      }
      onIdToken(idToken);
    } catch (e) {
      const code = e instanceof BrowserAuthError ? e.errorCode : "";
      if (code === "user_cancelled" || code === "popup_window_error") {
        setErr("Microsoft sign-in was cancelled.");
      } else if (code === "interaction_in_progress") {
        setErr("A sign-in is already in progress. Please wait a moment and try again.");
      } else {
        setErr("Could not connect to Microsoft. Please try again.");
      }
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [onIdToken]);

  if (!CLIENT_ID) {
    // Graceful degradation: if Microsoft isn't configured, render nothing rather
    // than nag the user. Matches how Google + Facebook fail open in production.
    return null;
  }

  return (
    <div className="ms-signin-wrap">
      <button
        type="button"
        className="ms-signin-btn"
        onClick={onClick}
        disabled={disabled || loading}
      >
        <MicrosoftLogo />
        <span className="ms-signin-btn__label">
          {loading ? "Connecting…" : "Continue with Microsoft"}
        </span>
      </button>
      {err ? <p className="ms-signin-err">{err}</p> : null}
    </div>
  );
}
