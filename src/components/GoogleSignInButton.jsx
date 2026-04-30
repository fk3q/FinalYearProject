import React, { useEffect, useRef, useState, useCallback } from "react";
import "./GoogleSignInButton.css";

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();

/**
 * Renders the official Google Sign-In button via GIS.
 * Parent supplies onCredential(credentialJwt) — typically POSTed to /api/auth/google.
 * Width tracks the container via ResizeObserver so the iframe is not scaled down
 * from a fixed 380px (which looked blurry next to crisp SVG social buttons).
 */
export default function GoogleSignInButton({ onCredential, disabled }) {
  const containerRef = useRef(null);
  const btnId = useRef(`gbtn-${Math.random().toString(36).slice(2)}`);
  const [btnWidth, setBtnWidth] = useState(320);

  const measureWidth = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const raw = Math.floor(el.clientWidth);
    // On mobile (< 600px viewport) the form column already constrains
    // width to roughly match Microsoft/Facebook, and any gutter we
    // subtract here just makes the Google iframe visibly narrower
    // than its siblings. On wider viewports we keep the small gutter
    // so Safari doesn't clip the label at the iframe edge (e.g.
    // "Continue with Googl"). Cap at 400 -- GIS hard-limits at 400 anyway.
    const isMobile =
      typeof window !== "undefined" && window.innerWidth < 600;
    const gutter = isMobile ? 0 : 28;
    const w = Math.max(
      220,
      Math.min(400, raw > gutter ? raw - gutter : raw)
    );
    setBtnWidth(w > 0 ? w : 320);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    if (typeof ResizeObserver === "undefined") {
      measureWidth();
      // Still listen for window resize so rotation re-measures.
      window.addEventListener("resize", measureWidth);
      return () => window.removeEventListener("resize", measureWidth);
    }
    measureWidth();
    const ro = new ResizeObserver(() => measureWidth());
    ro.observe(el);
    // Window resize covers the case where viewport size changes
    // (e.g. iOS rotation) but the container's clientWidth in CSS
    // pixels happens to land at the same value — the mobile/desktop
    // gutter branch should still be re-evaluated.
    window.addEventListener("resize", measureWidth);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measureWidth);
    };
  }, [measureWidth]);

  useEffect(() => {
    if (!CLIENT_ID || !containerRef.current) return undefined;
    const mountEl = containerRef.current;

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
      inner.style.boxSizing = "border-box";
      inner.style.display = "flex";
      inner.style.justifyContent = "center";
      inner.style.alignItems = "stretch";
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
  }, [onCredential, btnWidth, disabled]);

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