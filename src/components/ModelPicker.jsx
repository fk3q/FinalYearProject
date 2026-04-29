// Cursor-style model picker.
//
// Renders the currently selected model as a compact pill button in the
// chat header; clicking opens a dropdown listing every model the user
// is allowed to pick (already tier-filtered + availability-filtered by
// the backend). Each row shows: label, speed badge, one-line
// description, and a checkmark on the active row.
//
// Models that are tier-allowed but currently unreachable (provider key
// not configured) appear disabled with an "Unavailable" footnote so the
// user understands they exist but can't be selected right now.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Sparkles } from "lucide-react";

import "./ModelPicker.css";

// Visual badges per speed level. Mirrors the Cursor reference (Fast,
// Medium, High, Extra High).
const SPEED_BADGE_CLASS = {
  Fast: "mp-speed--fast",
  Medium: "mp-speed--medium",
  High: "mp-speed--high",
  "Extra High": "mp-speed--xhigh",
};

const ModelPicker = ({
  models,
  selectedId,
  onSelect,
  loading,
  error,
  className = "",
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = useMemo(
    () => models.find((m) => m.id === selectedId) || null,
    [models, selectedId]
  );

  if (loading && !models.length) {
    return (
      <div className={`mp-picker mp-picker--loading ${className}`}>
        <Sparkles size={14} /> Loading models…
      </div>
    );
  }

  if (error && !models.length) {
    return (
      <div className={`mp-picker mp-picker--error ${className}`} title={error}>
        Models unavailable
      </div>
    );
  }

  if (!models.length) {
    return null;
  }

  return (
    <div className={`mp-picker ${className}`} ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        className="mp-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={selected?.description || ""}
      >
        <Sparkles size={14} className="mp-trigger__icon" />
        <span className="mp-trigger__label">{selected?.label || "Pick a model"}</span>
        {selected?.speed_label && (
          <span
            className={`mp-speed ${SPEED_BADGE_CLASS[selected.speed_label] || ""}`}
          >
            {selected.speed_label}
          </span>
        )}
        <ChevronDown
          size={14}
          className={`mp-trigger__chevron${open ? " mp-trigger__chevron--open" : ""}`}
        />
      </button>

      {open && (
        <div role="listbox" className="mp-menu">
          {models.map((m) => {
            const isActive = m.id === selectedId;
            const isDisabled = !m.available;
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`mp-option${isActive ? " mp-option--active" : ""}${
                  isDisabled ? " mp-option--disabled" : ""
                }`}
                onClick={() => {
                  if (isDisabled) return;
                  onSelect(m.id);
                  setOpen(false);
                }}
                disabled={isDisabled}
                title={
                  isDisabled
                    ? "This provider isn't configured on the server."
                    : m.description
                }
              >
                <div className="mp-option__main">
                  <span className="mp-option__label">{m.label}</span>
                  {m.speed_label && (
                    <span
                      className={`mp-speed ${
                        SPEED_BADGE_CLASS[m.speed_label] || ""
                      }`}
                    >
                      {m.speed_label}
                    </span>
                  )}
                  {isActive && <Check size={14} className="mp-option__check" />}
                </div>
                <div className="mp-option__desc">
                  {isDisabled ? "Unavailable on this server" : m.description}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ModelPicker;
