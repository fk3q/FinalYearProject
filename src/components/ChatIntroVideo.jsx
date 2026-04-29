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
const ChatIntroVideo = ({ src = "/chat-intro.mp4", onClose }) => {
  // Play the video once per device, not on every /chat mount. We
  // initialise `open` from localStorage so a returning user is never
  // ambushed by the cinematic again, and so the parent's onClose chain
  // (AI-modes carousel) gets a chance to fire immediately.
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem("laboracle_intro_video_seen") !== "1";
    } catch {
      return true;
    }
  });
  const [muted, setMuted] = useState(true);
  const videoRef = useRef(null);
  const skipBtnRef = useRef(null);

  // If the video is suppressed, fire onClose on the next tick so any
  // chained UI (AI-modes flash cards) can decide whether to render.
  useEffect(() => {
    if (open) return undefined;
    if (typeof onClose !== "function") return undefined;
    const t = window.setTimeout(() => onClose(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wrapper used by every dismissal path so we always notify the parent
  // exactly once per mount. Some dismissal sources (Skip, ESC, end,
  // backdrop, error) used to call setOpen(false) directly, which left
  // the chained AI-modes flash-card carousel without a trigger. Also
  // marks the video as "seen" so it doesn't replay on the next visit.
  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem("laboracle_intro_video_seen", "1");
    } catch {
      /* persistent flag can't be saved -- worst case the video
         replays on the next visit, which is non-fatal. */
    }
    if (typeof onClose === "function") onClose();
  };

  // ESC-to-close, body-scroll lock, and initial focus on the skip
  // button so the modal is reachable from the keyboard immediately.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") dismiss();
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
    if (e.target === e.currentTarget) dismiss();
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
        onClick={dismiss}
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
        onEnded={dismiss}
        // If the video file is missing (e.g. before the asset has
        // been copied into /public on a fresh deploy) the modal
        // auto-dismisses instead of showing a broken-video frame.
        onError={dismiss}
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
