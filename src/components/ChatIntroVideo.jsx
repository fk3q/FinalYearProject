import React, { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, X } from "lucide-react";
import "./ChatIntroVideo.css";

// Cinematic intro that plays every time the user lands on /chat.
//
// Full-screen dark overlay with the video centred. Dismisses via:
//   - "Skip" button (top-right)
//   - ESC key
//   - Click on the backdrop (outside the video)
//   - Video reaching its natural end (onEnded)
//
// Starts muted because every modern browser blocks autoplay-with-sound
// unless the user has interacted with the page recently. A small mute
// toggle (bottom-right) lets the viewer turn audio on once it's
// playing -- a single user gesture is enough to unmute even if the
// page hadn't been interacted with yet.
const ChatIntroVideo = ({ src = "/chat-intro.mp4" }) => {
  const [open, setOpen] = useState(true);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef(null);
  const skipBtnRef = useRef(null);

  // ESC-to-close, body-scroll lock, and initial focus on the skip
  // button so the modal is reachable from the keyboard immediately.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    // Defer focus a tick so the focus ring doesn't flash before the
    // backdrop's fade-in completes.
    const focusTimer = window.setTimeout(() => {
      skipBtnRef.current?.focus();
    }, 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(focusTimer);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Belt-and-braces autoplay. The <video> already has the autoPlay
  // attribute, but a) some browsers ignore it on first paint inside
  // a freshly-mounted React tree and b) we may need to retry after
  // the muted attribute settles. Calling .play() explicitly on mount
  // covers both cases. We swallow the rejection if the browser still
  // blocks it -- the user can press play on the controls.
  useEffect(() => {
    if (!open) return;
    const v = videoRef.current;
    if (!v) return;
    const p = v.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {});
    }
  }, [open]);

  if (!open) return null;

  // Backdrop-only click handler -- ignore clicks bubbling up from
  // the video element / its native controls.
  const onBackdropClick = (e) => {
    if (e.target === e.currentTarget) setOpen(false);
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    const next = !muted;
    v.muted = next;
    setMuted(next);
    // If we just unmuted, the play state may have stalled; nudge it.
    if (!next) {
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
  };

  return (
    <div
      className="chat-intro-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome animation"
      onClick={onBackdropClick}
    >
      <button
        type="button"
        ref={skipBtnRef}
        className="chat-intro-skip"
        onClick={() => setOpen(false)}
        aria-label="Skip intro video"
      >
        Skip <X size={16} aria-hidden="true" />
      </button>

      <video
        ref={videoRef}
        className="chat-intro-video"
        src={src}
        autoPlay
        muted={muted}
        playsInline
        onEnded={() => setOpen(false)}
        // If the video file is missing (e.g. before the asset has
        // been copied into /public on a fresh deploy) the modal
        // auto-dismisses instead of showing a broken-video frame.
        onError={() => setOpen(false)}
      />

      <button
        type="button"
        className="chat-intro-mute"
        onClick={toggleMute}
        aria-label={muted ? "Unmute video" : "Mute video"}
      >
        {muted ? (
          <VolumeX size={18} aria-hidden="true" />
        ) : (
          <Volume2 size={18} aria-hidden="true" />
        )}
      </button>
    </div>
  );
};

export default ChatIntroVideo;
