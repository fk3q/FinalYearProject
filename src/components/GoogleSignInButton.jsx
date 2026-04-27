import React, { useEffect, useRef } from "react";
import "./GoogleSignInButton.css";

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();

/**
 * Renders the official Google Sign-In button via GIS.
 * Parent supplies onCredential(credentialJwt) — typically POSTed to /api/auth/google.
 */
export default function GoogleSignInButton({ onCredential, disabled }) {
  const containerRef = useRef(null);
  const btnId = useRef(`gbtn-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!CLIENT_ID || !containerRef.current) return;

    const tryInit = () => {
      if (!window.google?.accounts?.id || !containerRef.current) {
        setTimeout(tryInit, 150);
        return;
      }
      const el = containerRef.current;
      el.innerHTML = "";
      const inner = document.createElement("div");
      inner.id = btnId.current;
      el.appendChild(inner);

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
        width: 380,
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
      });
    };

    tryInit();
  }, [onCredential]);

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
      ref={containerRef}
      className={`google-signin-mount ${disabled ? "google-signin-mount--disabled" : ""}`}
      aria-hidden={disabled}
    />
  );
}
