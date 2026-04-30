import React, { useEffect, useRef, useState, useCallback } from "react";
import "./GoogleSignInButton.css";

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();

/* Official multicolour "G" mark (Google brand guidelines). */
const GoogleLogo = () => (
  <svg
    className="google-signin-btn__icon"
    width="20"
    height="20"
    viewBox="0 0 48 48"
    aria-hidden="true"
    focusable="false"
  >
    <path
      fill="#FFC107"
      d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
    />
    <path
      fill="#FF3D00"
      d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
    />
  </svg>
);

/**
 * Renders a custom Google sign-in button styled to match the Microsoft and
 * Facebook buttons. The official Google Identity Services button is rendered
 * invisibly on top to capture the click and run the auth flow — that way we
 * keep Google's compliant flow while controlling the visible chrome.
 *
 * Parent supplies onCredential(credentialJwt) — typically POSTed to /api/auth/google.
 */
export default function GoogleSignInButton({ onCredential, disabled }) {
  const overlayRef = useRef(null);
  const btnId = useRef(`gbtn-${Math.random().toString(36).slice(2)}`);
  const [btnWidth, setBtnWidth] = useState(320);
  const [btnHeight, setBtnHeight] = useState(44);

  const measureSize = useCallback(() => {
    const el = overlayRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    setBtnWidth(Math.max(220, Math.min(420, w > 0 ? w : 320)));
    setBtnHeight(Math.max(40, Math.min(56, h > 0 ? h : 44)));
  }, []);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return undefined;
    if (typeof ResizeObserver === "undefined") {
      measureSize();
      return undefined;
    }
    measureSize();
    const ro = new ResizeObserver(() => measureSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureSize]);

  useEffect(() => {
    if (!CLIENT_ID || !overlayRef.current) return undefined;
    const mountEl = overlayRef.current;

    if (disabled) {
      mountEl.innerHTML = "";
      return undefined;
    }

    let cancelled = false;
    let timeoutId = 0;

    const tryInit = () => {
      if (cancelled || !mountEl) return;
      if (!window.google?.accounts?.id) {
        timeoutId = window.setTimeout(tryInit, 150);
        return;
      }
      mountEl.innerHTML = "";
      const inner = document.createElement("div");
      inner.id = btnId.current;
      inner.style.width = "100%";
      inner.style.height = "100%";
      mountEl.appendChild(inner);

      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (res) => {
          if (res?.credential) onCredential(res.credential);
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      window.google.accounts.id.renderButton(inner, {
        theme: "outline",
        size: "large",
        width: btnWidth,
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
      });
    };

    tryInit();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [onCredential, btnWidth, btnHeight, disabled]);

  if (!CLIENT_ID) {
    return (
      <p className="google-signin-hint">
        Google Sign-In is not configured. Add <code>VITE_GOOGLE_CLIENT_ID</code>{" "}
        and rebuild the frontend.
      </p>
    );
  }

  return (
    <div
      className={`google-signin-mount ${disabled ? "google-signin-mount--disabled" : ""}`}
    >
      <div className="google-signin-shell" aria-hidden="true">
        <GoogleLogo />
        <span className="google-signin-shell__label">Continue with Google</span>
      </div>
      <div
        ref={overlayRef}
        className="google-signin-overlay"
        aria-label="Continue with Google"
      />
    </div>
  );
}
