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
    return (
      <p className="fb-signin-hint">
        Facebook Login is not configured. Add <code>VITE_FACEBOOK_APP_ID</code> and rebuild
        the frontend.
      </p>
    );
  }

  return (
    <div className="fb-signin-wrap">
      <button
        type="button"
        className="fb-signin-btn"
        onClick={onClick}
        disabled={disabled || loading}
      >
        {loading ? "Connecting…" : "Continue with Facebook"}
      </button>
      {err ? <p className="fb-signin-err">{err}</p> : null}
    </div>
  );
}
