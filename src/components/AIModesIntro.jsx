import React, { useEffect, useState } from "react";
import { GraduationCap, Lightbulb, Lock, Notebook, X } from "lucide-react";
import "./AIModesIntro.css";

// Flash-card carousel that plays once after a fresh login or signup,
// right after the cinematic intro video closes. Walks the user through
// the four AI modes (Deterministic, Exploratory, Test, Research) so
// they understand what the sidebar toggle is actually doing.
//
// Triggering rule:
//   - Login.jsx / Signup.jsx set `laboracle_show_modes_intro=1` on
//     successful auth.
//   - ChatPage waits for ChatIntroVideo to close, then mounts this
//     component if the flag is set.
//   - We clear the flag the moment we mount so refreshing the page
//     never replays the carousel.
//
// Dismissal:
//   - "Got it" on the last card
//   - "Skip" button (top-right)
//   - ESC key
//   - Backdrop click

const CARDS = [
  {
    id: "deterministic",
    icon: Lock,
    title: "Deterministic",
    tagline: "Strict, document-grounded answers",
    body:
      "Locks Laboracle to what's actually inside the documents you've " +
      "uploaded. Best for studying, fact-checking, and any time you " +
      "need a reply you can verify against the source.",
    accent: "indigo",
  },
  {
    id: "exploratory",
    icon: Lightbulb,
    title: "Exploratory",
    tagline: "Grounded answers + broader connections",
    body:
      "Combines what's in your documents with general knowledge so you " +
      "can explore tangents and learn beyond the syllabus. Works even " +
      "if you haven't uploaded anything yet.",
    accent: "violet",
  },
  {
    id: "test",
    icon: GraduationCap,
    title: "Test",
    tagline: "Quiz yourself on what you uploaded",
    body:
      "Generates MCQs, short-answer prompts, and true/false questions " +
      "from your documents — complete with an answer key. Great for " +
      "exam prep before a deadline.",
    accent: "fuchsia",
  },
  {
    id: "research",
    icon: Notebook,
    title: "Research",
    tagline: "Academic synthesis & structured notes",
    body:
      "Cornell notes, lit-review drafts, methodology breakdowns, and " +
      "citation-rich summaries. Built for university-level work where " +
      "the structure matters as much as the content.",
    accent: "sky",
  },
];

const AIModesIntro = ({ onDone }) => {
  const [open, setOpen] = useState(true);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") closeAndFinish();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  const closeAndFinish = () => {
    setOpen(false);
    if (typeof onDone === "function") onDone();
  };

  const goPrev = () => setIndex((i) => Math.max(0, i - 1));
  const goNext = () => {
    if (index >= CARDS.length - 1) {
      closeAndFinish();
      return;
    }
    setIndex((i) => i + 1);
  };

  const onBackdropClick = (e) => {
    if (e.target === e.currentTarget) closeAndFinish();
  };

  if (!open) return null;

  const card = CARDS[index];
  const Icon = card.icon;
  const isLast = index === CARDS.length - 1;
  const isFirst = index === 0;

  return (
    <div
      className="ami-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="AI mode walkthrough"
      onClick={onBackdropClick}
    >
      <div className={`ami-card ami-card--${card.accent}`}>
        <button
          type="button"
          className="ami-skip"
          onClick={closeAndFinish}
          aria-label="Skip walkthrough"
        >
          Skip <X size={14} aria-hidden="true" />
        </button>

        <div className="ami-eyebrow">Quick tour · AI modes</div>

        <div className="ami-icon-wrap" aria-hidden="true">
          <Icon size={36} strokeWidth={1.6} />
        </div>

        <h2 className="ami-title">{card.title}</h2>
        <div className="ami-tagline">{card.tagline}</div>
        <p className="ami-body">{card.body}</p>

        <div className="ami-dots" aria-hidden="true">
          {CARDS.map((c, i) => (
            <span
              key={c.id}
              className={`ami-dot ${i === index ? "ami-dot--on" : ""}`}
            />
          ))}
        </div>

        <div className="ami-actions">
          <button
            type="button"
            className="ami-btn ami-btn--ghost"
            onClick={goPrev}
            disabled={isFirst}
          >
            Back
          </button>
          <div className="ami-step-label" aria-live="polite">
            {index + 1} of {CARDS.length}
          </div>
          <button
            type="button"
            className="ami-btn ami-btn--primary"
            onClick={goNext}
            autoFocus
          >
            {isLast ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIModesIntro;
