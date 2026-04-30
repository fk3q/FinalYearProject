import React from "react";
import "./ChatSidebarBrandMark.css";

/**
 * Circular Laboracle mark + bubble motif — identical on Chat and Profile sidebars.
 */
export default function ChatSidebarBrandMark({ onClick, className = "" }) {
  return (
    <button
      type="button"
      className={`cp-brand ${className}`.trim()}
      onClick={onClick}
      aria-label="Laboracle — go to home"
    >
      <span className="cp-brand-circle">
        <img
          src="/laboracle-logo.png"
          alt=""
          className="cp-brand-logo"
        />
        <span className="cp-logo-bubbles" aria-hidden="true">
          <span className="cp-logo-bubble" />
          <span className="cp-logo-bubble" />
          <span className="cp-logo-bubble" />
          <span className="cp-logo-bubble" />
          <span className="cp-logo-bubble" />
          <span className="cp-logo-bubble" />
        </span>
      </span>
    </button>
  );
}
