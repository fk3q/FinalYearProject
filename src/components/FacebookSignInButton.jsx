import React, { useCallback, useState } from "react";
import "./FacebookSignInButton.css";

const APP_ID = (import.meta.env.VITE_FACEBOOK_APP_ID || "").trim();
const SDK_LOCALE = "en_GB";

function loadFacebookSdk() {
  if (window.FB) return Promise.resolve();
  if (window._fbSdkLoading) return window._fbSdkLoading;

  window._fbSdkLoading = new Promise((resolve, reject) => {
    if (document.getElementById("facebook-jssdk")) {
      const check = () => (window.FB ? resolve() : setTimeout(check, 50));
      check();
      return;
    }
    window.fbAsyncInit = () => {
      try {
        window.FB.init({
          appId: APP_ID,
          cookie: true,
          xfbml: false,
          version: "v21.0",
        });
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    const js = document.createElement("script");
    js.id = "facebook-jssdk";
    js.async = true;
    js.defer = true;
    js.crossOrigin = "anonymous";
    js.src = `https://connect.facebook.net/${SDK_LOCALE}/sdk.js`;
    js.onerror = () => reject(new Error("Could not load Facebook SDK"));
    document.body.appendChild(js);
  });
  return window._fbSdkLoading;
}

export default function FacebookSignInButton({ onAccessToken, disabled }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const onClick = useCallback(async () => {
    if (!APP_ID) return;
    setErr("");
    setLoading(true);
    try {
      await loadFacebookSdk();
      window.FB.login(
        (response) => {
          setLoading(false);
          const tok = response?.authResponse?.accessToken;
          if (tok) {
            onAccessToken(tok);
            return;
          }
          if (response?.status === "not_authorized" || !response?.authResponse) {
            setErr("Facebook sign-in was cancelled or not authorized.");
            return;
          }
          setErr("Could not get a Facebook session. Please try again.");
        },
        { scope: "public_profile,email" }
      );
    } catch (e) {
      setLoading(false);
      setErr("Could not connect to Facebook.");
    }
  }, [onAccessToken]);

  if (!APP_ID) {
    // Graceful degradation — same as Microsoft: hide entirely when not configured.
    return null;
  }

  return (
    <div className="fb-signin-wrap">
      <button
        type="button"
        className="fb-signin-btn"
        onClick={onClick}
        disabled={disabled || loading}
      >
        <FacebookLogo />
        <span className="fb-signin-btn__label">
          {loading ? "Connecting…" : "Continue with Facebook"}
        </span>
      </button>
      {err ? <p className="fb-signin-err">{err}</p> : null}
    </div>
  );
}

const FacebookLogo = () => (
  <svg
    className="fb-signin-btn__icon"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <path
      fill="#1877f2"
      d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.412c0-3.026 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.514c-1.491 0-1.956.93-1.956 1.886v2.264h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"
    />
  </svg>
);
