import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  MessageSquare,
  User,
  Settings as SettingsIcon,
  CreditCard,
  LifeBuoy,
  Headphones,
  Mic,
  Square,
  Loader2,
  PanelLeft,
  X,
  Image as ImageIcon,
} from "lucide-react";
import {
  transcribeAudio,
  pickRecorderMimeType,
  MAX_RECORDING_SECONDS,
} from "./api/voice";
import AccountSidebarBlock from "./components/AccountSidebarBlock";
import ChatSidebarBrandMark from "./components/ChatSidebarBrandMark";
import AIModesIntro from "./components/AIModesIntro";
import ChatIntroVideo from "./components/ChatIntroVideo";
import MicWaveform from "./components/MicWaveform";
import ModelPicker from "./components/ModelPicker";
import NotificationBell from "./components/NotificationBell";
import { useUsageTracker } from "./hooks/useUsageTracker";
import { useModels } from "./hooks/useModels";
import { authHeaders, getSessionUser } from "./api/auth";
import {
  getApiBase,
  listChatSessions,
  getChatSession,
  deleteChatSession,
} from "./api/chatHistory";
import "./ChatPage.css";

/** Normalize FastAPI `detail` (string | validation array | object) for UI text. */
function parseFastApiDetail(detail) {
  if (detail == null || detail === "") return "";
  if (typeof detail === "string") return detail.trim();
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && item.msg != null)
          return String(item.msg);
        return "";
      })
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  if (typeof detail === "object") {
    if (typeof detail.message === "string") return detail.message.trim();
  }
  return "";
}

const WELCOME_MESSAGE = {
  id: 0,
  type: "bot",
  text: "Hello! I'm Laboracle. Ask me anything about the documents you've uploaded.",
  // No chip until a real model reply — avoids showing a bogus "100%"
  // that isn't computed by the retrieval heuristic.
  confidence: 0,
  citations: [],
};

// Pretty labels + sidebar hints for each backend mode. Keeping these
// in a single map (instead of inline ternaries) means adding a 5th
// mode later is a one-liner.
const AI_MODE_LABELS = {
  deterministic: "Deterministic",
  exploratory:   "Exploratory",
  test:          "Test",
  research:      "Research",
};

const AI_MODE_HINTS = {
  deterministic: "Answers are grounded strictly in your uploaded documents.",
  exploratory:   "Grounded answers plus broader connections beyond the documents.",
  test:          "Generates quizzes (MCQ, short answer, true/false) from your uploads with answer keys.",
  research:      "Academic synthesis, Cornell notes, lit-review drafts, and citation-rich summaries.",
};

const ChatPage = () => {
  useUsageTracker();
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState("student");
  const [aiMode, setAiMode] = useState("deterministic");
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  // Model picker — list, current selection, and tier metadata. The
  // hook persists the user's choice in sessionStorage across page navs
  // and reconciles the cached id whenever /api/models is refetched
  // (e.g. tier changed, model retired).
  const {
    models,
    selectedId: selectedModelId,
    setSelectedId: setSelectedModelId,
    loading: modelsLoading,
    error: modelsError,
  } = useModels();

  // Voice-input state: idle → recording → transcribing → idle.
  // `recording` toggles the mic-button styling and starts the duration
  // timer. `transcribing` shows a spinner while Whisper is working. The
  // last error (mic permission, quota, etc.) lives in `voiceError` so
  // we can show a one-line hint under the textarea.
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceError, setVoiceError] = useState("");
  // Mirror of `recordingStreamRef.current` as React state so the
  // <MicWaveform> child can re-render when the stream comes/goes.
  // (A ref alone wouldn't trigger the visualizer to mount/unmount.)
  const [recordingStream, setRecordingStream] = useState(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const recordingStreamRef = useRef(null);

  // AI-modes flash-card walkthrough.
  //
  // Auto-show rules (mirrors ChatIntroVideo):
  //   1. ALWAYS queue after a fresh login/signup (the
  //      `laboracle_just_authed` session flag is set by Login.jsx /
  //      Signup.jsx right before navigating to /chat). The carousel
  //      then triggers as soon as the cinematic dismisses.
  //   2. Otherwise, queue only for first-time users on this device
  //      (`laboracle_modes_tour_done` localStorage flag). This makes
  //      the tour a one-shot gimmick on organic visits.
  //
  // Manual replay: the "Replay tour" button beneath the AI Mode hint
  // sets `showModesIntro` directly, bypassing the auto-show logic.
  const [showModesIntro, setShowModesIntro] = useState(false);
  const modesIntroPendingRef = useRef(false);

  // Mobile drawer: sidebar becomes an off-canvas panel; desktop keeps it inline.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileDrawerBreakpoint, setMobileDrawerBreakpoint] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 768px)").matches
      : false
  );

  const sidebarRef = useRef(null);
  const sidebarCloseBtnRef = useRef(null);
  const menuTriggerRef = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const sync = () => {
      setMobileDrawerBreakpoint(mq.matches);
      if (!mq.matches) setMobileSidebarOpen(false);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!mobileSidebarOpen || !mobileDrawerBreakpoint) return undefined;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onEsc = (e) => {
      if (e.key === "Escape") setMobileSidebarOpen(false);
    };
    document.addEventListener("keydown", onEsc);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onEsc);
    };
  }, [mobileSidebarOpen, mobileDrawerBreakpoint]);

  // React 18-friendly `inert` on the sidebar when the mobile drawer is closed,
  // so tab order skips off-screen controls.
  useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;
    if (mobileDrawerBreakpoint && !mobileSidebarOpen) {
      el.setAttribute("inert", "");
    } else {
      el.removeAttribute("inert");
    }
  }, [mobileDrawerBreakpoint, mobileSidebarOpen]);

  // Initial focus when opening + restore focus to the menu trigger when closing.
  useEffect(() => {
    if (!mobileSidebarOpen || !mobileDrawerBreakpoint) return undefined;

    const id = requestAnimationFrame(() => {
      sidebarCloseBtnRef.current?.focus();
    });

    return () => {
      cancelAnimationFrame(id);
      menuTriggerRef.current?.focus({ preventScroll: true });
    };
  }, [mobileSidebarOpen, mobileDrawerBreakpoint]);

  // Keep keyboard focus inside the drawer while it is open (capture phase).
  useEffect(() => {
    if (!mobileSidebarOpen || !mobileDrawerBreakpoint || !sidebarRef.current)
      return undefined;

    const sidebar = sidebarRef.current;
    const selector =
      'button:not([disabled]), a[href]:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const focusables = () =>
      Array.from(sidebar.querySelectorAll(selector)).filter(
        (el) =>
          el instanceof HTMLElement &&
          el.offsetParent !== null &&
          sidebar.contains(el)
      );

    const onKeyDown = (e) => {
      if (e.key !== "Tab") return;
      const nodes = focusables();
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      const contained = active instanceof Node && sidebar.contains(active);

      if (e.shiftKey) {
        if (!contained || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!contained || active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [mobileSidebarOpen, mobileDrawerBreakpoint]);
  useEffect(() => {
    try {
      // Legacy session flag from earlier flow; clear it so it can't
      // leak into a future build that still checks for it.
      sessionStorage.removeItem("laboracle_show_modes_intro");

      const justAuthed =
        sessionStorage.getItem("laboracle_just_authed") === "1";
      const tourDone =
        localStorage.getItem("laboracle_modes_tour_done") === "1";

      if (justAuthed || !tourDone) {
        modesIntroPendingRef.current = true;
      }

      // Consume the auth flag so a same-tab refresh of /chat doesn't
      // re-trigger the cinematic + cards mid-session. ChatIntroVideo
      // already read the flag during its initial render (synchronous,
      // before this effect runs), so clearing it here is safe.
      sessionStorage.removeItem("laboracle_just_authed");
    } catch {
      /* storage may be unavailable in private mode -- skip the tour */
    }
  }, []);

  const handleModesIntroDone = () => {
    setShowModesIntro(false);
    try {
      localStorage.setItem("laboracle_modes_tour_done", "1");
    } catch {
      /* persistent flag can't be saved -- worst case the tour
         replays on next visit, which is non-fatal. */
    }
  };

  // Manual "Replay tour" trigger. We don't touch the localStorage flag
  // here -- a manual replay shouldn't reset the "seen it" state, just
  // reopen the cards on demand for whoever wants a refresher.
  const replayModesTour = () => {
    setShowModesIntro(true);
  };

  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);
  const imageInputRef = useRef(null);

  // Inline image attachments for the next message. Each entry is a
  // `{ id, name, dataUrl }` record where `dataUrl` is a
  // `data:<mime>;base64,<payload>` string ready to ship to the backend
  // and embed into the user's chat bubble. Cleared after every send.
  const [pendingImages, setPendingImages] = useState([]);

  const fileToDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Could not read image"));
      reader.readAsDataURL(file);
    });

  const handleImagePick = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    const onlyImages = files.filter((f) => /^image\//i.test(f.type));
    try {
      const additions = await Promise.all(
        onlyImages.map(async (f) => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: f.name || "image",
          dataUrl: await fileToDataUrl(f),
        }))
      );
      setPendingImages((p) => [...p, ...additions]);
    } catch (err) {
      console.error("Image read failed", err);
    }
  };

  const removePendingImage = (id) =>
    setPendingImages((p) => p.filter((img) => img.id !== id));

  // Clipboard paste — when the user presses Ctrl/Cmd+V (or right-click ▸
  // Paste) anywhere on the chat surface and the clipboard contains an
  // image (e.g. a Win+Shift+S screenshot, a copied PNG from Figma, etc.),
  // ingest each image item the same way the file picker does.
  // We attach the listener to `document` so paste works regardless of
  // whether the textarea, chat surface, or whitespace is focused.
  const handlePaste = useCallback(async (e) => {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;

    const imageFiles = [];
    for (let i = 0; i < items.length; i += 1) {
      const it = items[i];
      if (it.kind === "file" && /^image\//i.test(it.type)) {
        const f = it.getAsFile();
        if (f) imageFiles.push(f);
      }
    }
    if (imageFiles.length === 0) return;

    // Stop the browser from pasting the image as a fat base64 blob into
    // the textarea (some browsers do that for inline content) — we want
    // it as an attachment, not in the prompt text.
    e.preventDefault();

    try {
      const additions = await Promise.all(
        imageFiles.map(async (f, idx) => ({
          id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          name: f.name && f.name !== "image.png"
            ? f.name
            : `screenshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`,
          dataUrl: await fileToDataUrl(f),
        }))
      );
      setPendingImages((p) => [...p, ...additions]);
    } catch (err) {
      console.error("Paste image read failed", err);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  const user = getSessionUser();
  const canSaveChats = Boolean(user?.id);

  const refreshSessions = useCallback(async () => {
    if (!user?.id) return;
    try {
      const list = await listChatSessions(user.id);
      setSessions(list);
      setHistoryError("");
    } catch (e) {
      setHistoryError(e.message || "Could not load saved chats");
    }
  }, [user?.id]);

  useEffect(() => {
    if (!canSaveChats) {
      setSessions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setHistoryLoading(true);
      try {
        await refreshSessions();
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canSaveChats, user?.id, refreshSessions]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const startNewChat = () => {
    setSessionId(null);
    setMessages([WELCOME_MESSAGE]);
  };

  const openSession = async (sid) => {
    if (!user?.id) return;
    setHistoryError("");
    try {
      const data = await getChatSession(user.id, sid);
      const mapped = data.messages.map((m) =>
        m.role === "user"
          ? { id: m.id, type: "user", text: m.content }
          : {
              id: m.id,
              type: "bot",
              text: m.content,
              confidence: m.confidence ?? 0,
              citations: m.citations || [],
            }
      );
      setSessionId(data.session_id);
      setMessages(mapped.length ? mapped : [WELCOME_MESSAGE]);
    } catch (e) {
      setHistoryError(e.message || "Could not open chat");
    }
  };

  const removeSession = async (e, sid) => {
    e.stopPropagation();
    if (!user?.id) return;
    try {
      await deleteChatSession(user.id, sid);
      await refreshSessions();
      if (sessionId === sid) startNewChat();
    } catch (err) {
      setHistoryError(err.message || "Could not delete chat");
    }
  };

  const send = async () => {
    const query = input.trim();
    if (!query && pendingImages.length === 0) return;

    const attachedImages = pendingImages;
    const userMsg = {
      id: Date.now(),
      type: "user",
      text: query,
      images: attachedImages.map((img) => img.dataUrl),
    };
    setMessages((p) => [...p, userMsg]);
    setInput("");
    setPendingImages([]);
    setIsTyping(true);

    try {
      const body = {
        query: query || "Describe what's in the attached image(s).",
        mode: aiMode,
        user_role: userRole,
      };
      if (sessionId) body.session_id = sessionId;
      if (selectedModelId) body.model = selectedModelId;
      if (attachedImages.length) {
        body.images = attachedImages.map((img) => img.dataUrl);
      }

      const res = await fetch(`${getApiBase()}/api/chat/query`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const detail = parseFastApiDetail(errBody.detail);
        throw new Error(
          detail || errBody.message || res.statusText || "Query failed"
        );
      }

      const data = await res.json();
      if (typeof data.session_id === "number") {
        setSessionId(data.session_id);
        refreshSessions();
      }
      setMessages((p) => [
        ...p,
        {
          id: Date.now() + 1,
          type: "bot",
          text: data.answer,
          confidence: data.confidence,
          citations: data.citations || [],
        },
      ]);
    } catch (err) {
      const raw = err?.message || "Something went wrong.";
      const billingOrModelHint =
        /another model|GPT-4o|Claude could not run|Anthropic|could not complete this reply|billing|credits|503/i.test(
          raw
        );
      const suffix = billingOrModelHint
        ? ""
        : " Please make sure the backend is running and documents have been uploaded.";
      setMessages((p) => [
        ...p,
        {
          id: Date.now() + 1,
          type: "bot",
          text: raw.startsWith("Error:") ? `${raw}${suffix}` : `Error: ${raw}${suffix}`,
          confidence: 0,
          citations: [],
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // ── Voice input ───────────────────────────────────────────────────
  // Releases all the resources we hold while recording: stops the
  // duration timer, kills the active mic stream, and clears the
  // MediaRecorder reference so a stale instance can't fire callbacks.
  const cleanupRecording = useCallback(() => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (recordingStreamRef.current) {
      try {
        recordingStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {
        /* stream may already be torn down */
      }
      recordingStreamRef.current = null;
    }
    setRecordingStream(null);
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
  }, []);

  const startRecording = useCallback(async () => {
    if (recording || transcribing) return;
    setVoiceError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError("Voice input isn't supported in this browser.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setVoiceError("Voice input isn't supported in this browser.");
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      // Most common: user dismissed the permission prompt. We don't
      // expose the underlying DOMException name -- a friendly hint is
      // enough for non-technical users.
      setVoiceError(
        err?.name === "NotAllowedError"
          ? "Microphone access was denied. Enable it in your browser settings."
          : "Couldn't access your microphone."
      );
      return;
    }

    const mimeType = pickRecorderMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    recordedChunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunksRef.current.push(e.data);
      }
    };

    recorder.onstop = async () => {
      // The active stream is no longer needed -- release the mic
      // immediately so the browser hides the recording indicator.
      if (recordingStreamRef.current) {
        try {
          recordingStreamRef.current.getTracks().forEach((t) => t.stop());
        } catch {
          /* already torn down */
        }
        recordingStreamRef.current = null;
      }
      // Drop the React-state mirror so <MicWaveform> unmounts and
      // releases its AudioContext immediately, not after onstop's
      // async transcription completes.
      setRecordingStream(null);
      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      const chunks = recordedChunksRef.current;
      recordedChunksRef.current = [];
      mediaRecorderRef.current = null;

      if (!chunks.length) {
        setRecording(false);
        return;
      }

      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      setRecording(false);
      setTranscribing(true);

      try {
        const text = await transcribeAudio(blob);
        if (text) {
          // Append to whatever was already typed -- a single space
          // separator if the box wasn't empty.
          setInput((prev) => (prev ? `${prev.trim()} ${text}` : text));
          textareaRef.current?.focus();
        } else {
          setVoiceError("Didn't catch anything. Try again?");
        }
      } catch (err) {
        setVoiceError(err?.message || "Transcription failed.");
      } finally {
        setTranscribing(false);
      }
    };

    mediaRecorderRef.current = recorder;
    recordingStreamRef.current = stream;
    // Push the live stream into React state too, so <MicWaveform>
    // can mount with the freshly-acquired MediaStream and start the
    // analyser graph on the same frame the button flips to recording.
    setRecordingStream(stream);

    setRecording(true);
    setRecordingSeconds(0);
    recorder.start();

    // Tick once a second so the UI can show elapsed time. Auto-stops
    // at MAX_RECORDING_SECONDS so a user that walks away from their
    // mic doesn't accidentally upload a 25 MB clip.
    const startedAt = Date.now();
    recordingTimerRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setRecordingSeconds(elapsed);
      if (elapsed >= MAX_RECORDING_SECONDS) {
        // Stop programmatically -- the onstop handler above takes
        // care of uploading whatever was captured up to this point.
        try {
          if (
            mediaRecorderRef.current &&
            mediaRecorderRef.current.state !== "inactive"
          ) {
            mediaRecorderRef.current.stop();
          }
        } catch {
          /* recorder already stopped */
        }
      }
    }, 250);
  }, [recording, transcribing]);

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current) return;
    try {
      if (mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    } catch {
      /* already stopped -- onstop will not fire again */
    }
  }, []);

  const toggleRecording = useCallback(() => {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [recording, startRecording, stopRecording]);

  // Tear everything down on unmount in case the user navigates away
  // mid-recording. Without this the mic indicator stays on until they
  // reload the tab.
  useEffect(() => {
    return () => cleanupRecording();
  }, [cleanupRecording]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  const confidenceColor = (c) => {
    if (c >= 90) return "cp-conf--high";
    if (c >= 75) return "cp-conf--mid";
    return "cp-conf--low";
  };

  // Quick-prompt buttons under the welcome message. Tailored to the
  // active mode so a researcher doesn't see "What is this course
  // about?" and a quiz-taker doesn't see "Summarise the key topics".
  const suggestionsByMode = {
    deterministic: [
      "What is this course about?",
      "Summarise the key topics",
      "What are the main objectives?",
      "Explain the program structure",
    ],
    exploratory: [
      "How does this connect to real-world examples?",
      "What broader fields does this relate to?",
      "Suggest related topics worth exploring",
      "What are common misconceptions here?",
    ],
    test: [
      "Test me with 5 MCQs",
      "Quiz me on key definitions",
      "Give me a true/false round",
      "Generate a short-answer quiz",
    ],
    research: [
      "Cornell notes for this document",
      "Summarise the key findings",
      "Extract methodology and limitations",
      "Suggest 5 follow-up research questions",
    ],
  };
  const suggestions =
    suggestionsByMode[aiMode] || suggestionsByMode.deterministic;

  const showSuggestions =
    messages.length === 1 && messages[0]?.id === WELCOME_MESSAGE.id && !sessionId;

  return (
    <div className="cp-page">
      {/* Cinematic intro that plays every time /chat mounts. The modal
          self-dismisses on Skip / ESC / backdrop click / video end.
          When it closes after a fresh login/signup we promote the
          one-shot AI-modes flash-card walkthrough into view. */}
      <ChatIntroVideo
        onClose={() => {
          if (modesIntroPendingRef.current) {
            modesIntroPendingRef.current = false;
            setShowModesIntro(true);
          }
        }}
      />
      {showModesIntro && (
        <AIModesIntro onDone={handleModesIntroDone} />
      )}
      <div
        className={`cp-sidebar-backdrop${mobileSidebarOpen ? " cp-sidebar-backdrop--visible" : ""}`}
        aria-hidden={!mobileSidebarOpen}
        onClick={() => setMobileSidebarOpen(false)}
      />
      <aside
        ref={sidebarRef}
        id="cp-chat-sidebar"
        className={`cp-sidebar${mobileSidebarOpen ? " cp-sidebar--mobile-open" : ""}`}
        aria-label="Laboracle navigation and settings"
        {...(mobileDrawerBreakpoint && mobileSidebarOpen
          ? { role: "dialog", "aria-modal": "true" }
          : {})}
      >
        <button
          ref={sidebarCloseBtnRef}
          type="button"
          className="cp-sidebar-close"
          aria-label="Close menu"
          onClick={() => setMobileSidebarOpen(false)}
        >
          <X size={22} strokeWidth={2} />
        </button>
        <ChatSidebarBrandMark
          onClick={() => {
            setMobileSidebarOpen(false);
            navigate("/");
          }}
        />

        <nav className="cp-nav">
          <button
            className="cp-nav-item"
            onClick={() => {
              setMobileSidebarOpen(false);
              navigate("/upload");
            }}
          >
            <span className="cp-nav-icon"><Upload /></span> Upload Documents
          </button>
          <button className="cp-nav-item active">
            <span className="cp-nav-icon"><MessageSquare /></span> Chat with AI
          </button>
        </nav>

        {/* Sidebar order: Saved chats → Your account → Role → AI mode →
            Account links (Profile / Settings / Subscription) → Help.
            The user-action surfaces (history, role, mode) sit closest to
            the chat workspace so they're reachable at a glance, while
            navigation that takes the user away from chat lives at the
            bottom. */}

        {canSaveChats && (
          <div className="cp-history">
            <div className="cp-history-header">
              <span className="cp-section-label">Saved chats</span>
              <button
                type="button"
                className="cp-history-new"
                onClick={() => {
                  setMobileSidebarOpen(false);
                  startNewChat();
                }}
                title="Start a new conversation"
              >
                + New
              </button>
            </div>
            {historyError && (
              <p className="cp-history-error" role="alert">
                {historyError}
              </p>
            )}
            <div className="cp-history-list">
              {historyLoading && (
                <div className="cp-history-placeholder">Loading…</div>
              )}
              {!historyLoading &&
                sessions.map((s) => (
                  <div
                    key={s.id}
                    className={`cp-history-item ${
                      sessionId === s.id ? "cp-history-item--active" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className="cp-history-item-main"
                      onClick={() => {
                        setMobileSidebarOpen(false);
                        openSession(s.id);
                      }}
                      title={s.title}
                    >
                      <span className="cp-history-item-title">{s.title}</span>
                    </button>
                    <button
                      type="button"
                      className="cp-history-item-del"
                      onClick={(e) => removeSession(e, s.id)}
                      title="Delete this chat"
                      aria-label="Delete chat"
                    >
                      ×
                    </button>
                  </div>
                ))}
              {!historyLoading && sessions.length === 0 && (
                <div className="cp-history-placeholder">
                  No saved chats yet. Send a message to create one.
                </div>
              )}
            </div>
          </div>
        )}

        {!canSaveChats && (
          <p className="cp-history-hint">
            <button
              type="button"
              className="cp-history-link"
              onClick={() => {
                setMobileSidebarOpen(false);
                navigate("/login");
              }}
            >
              Sign in
            </button>{" "}
            to save and reopen your chats.
          </p>
        )}

        <AccountSidebarBlock
          variant="cp"
          onBeforeNavigate={() => setMobileSidebarOpen(false)}
        />

        <div className="cp-section-label">AI Mode</div>
        <div className="cp-toggle-group cp-toggle-group--grid">
          <button
            className={`cp-toggle ${aiMode === "deterministic" ? "cp-toggle--on" : ""}`}
            onClick={() => setAiMode("deterministic")}
            title="Factual answers from your uploaded documents only"
          >
            Deterministic
          </button>
          <button
            className={`cp-toggle ${aiMode === "exploratory" ? "cp-toggle--on" : ""}`}
            onClick={() => setAiMode("exploratory")}
            title="Grounded answers plus broader connections"
          >
            Exploratory
          </button>
          <button
            className={`cp-toggle ${aiMode === "test" ? "cp-toggle--on" : ""}`}
            onClick={() => setAiMode("test")}
            title="Quizzes you on your uploaded documents (MCQ + short answer)"
          >
            Test
          </button>
          <button
            className={`cp-toggle ${aiMode === "research" ? "cp-toggle--on" : ""}`}
            onClick={() => setAiMode("research")}
            title="Academic summaries, structured notes, and research workflows"
          >
            Research
          </button>
        </div>

        <div className="cp-mode-hint">
          {AI_MODE_HINTS[aiMode] || AI_MODE_HINTS.deterministic}
          <button
            type="button"
            className="cp-mode-replay"
            onClick={replayModesTour}
            title="Open the AI mode quick tour again"
          >
            Replay AI mode tour
          </button>
        </div>

        <div className="cp-section-label">Role</div>
        <div className="cp-toggle-group">
          <button
            className={`cp-toggle ${userRole === "student" ? "cp-toggle--on" : ""}`}
            onClick={() => setUserRole("student")}
          >
            Student
          </button>
          <button
            className={`cp-toggle ${userRole === "teacher" ? "cp-toggle--on" : ""}`}
            onClick={() => setUserRole("teacher")}
          >
            Teacher / Professor
          </button>
        </div>

        <div className="cp-section-label">Account</div>
        <nav className="cp-nav">
          <button
            className="cp-nav-item"
            onClick={() => {
              setMobileSidebarOpen(false);
              navigate("/profile");
            }}
          >
            <span className="cp-nav-icon"><User /></span> Profile
          </button>
          <button
            className="cp-nav-item"
            onClick={() => {
              setMobileSidebarOpen(false);
              navigate("/profile#settings");
            }}
          >
            <span className="cp-nav-icon"><SettingsIcon /></span> Settings
          </button>
          <button
            className="cp-nav-item"
            onClick={() => {
              setMobileSidebarOpen(false);
              navigate("/profile#subscription");
            }}
          >
            <span className="cp-nav-icon"><CreditCard /></span> Subscription
          </button>
        </nav>

        <div className="cp-section-label">Help</div>
        <nav className="cp-nav">
          <button
            className="cp-nav-item"
            onClick={() => {
              setMobileSidebarOpen(false);
              window.location.href =
                "mailto:laboraclee@gmail.com?subject=Help%20centre%20enquiry";
            }}
          >
            <span className="cp-nav-icon"><LifeBuoy /></span> Help centre
          </button>
          <button
            className="cp-nav-item"
            onClick={() => {
              setMobileSidebarOpen(false);
              window.location.href =
                "mailto:laboraclee@gmail.com?subject=Support%20request";
            }}
          >
            <span className="cp-nav-icon"><Headphones /></span> Support
          </button>
        </nav>
      </aside>

      <main className="cp-main">
        <header className="cp-header">
          <div className="cp-header-left">
            <button
              ref={menuTriggerRef}
              type="button"
              id="cp-chat-menu-trigger"
              className="cp-header-menu"
              aria-label="Open menu — modes, profile, saved chats"
              aria-controls="cp-chat-sidebar"
              aria-expanded={
                mobileDrawerBreakpoint ? mobileSidebarOpen : undefined
              }
              aria-haspopup={mobileDrawerBreakpoint ? "dialog" : undefined}
              onClick={() => setMobileSidebarOpen(true)}
            >
              <PanelLeft size={22} strokeWidth={2} />
            </button>
            <div className="cp-ai-avatar">AI</div>
            <div className="cp-header-titles">
              <div className="cp-header-title">Laboracle</div>
              <div className="cp-header-sub">
                {AI_MODE_LABELS[aiMode] || AI_MODE_LABELS.deterministic} &bull;{" "}
                {userRole === "student" ? "Student" : "Teacher / Professor"} mode
              </div>
            </div>
          </div>
          <div className="cp-header-right">
            <NotificationBell />
            <ModelPicker
              models={models}
              selectedId={selectedModelId}
              onSelect={setSelectedModelId}
              loading={modelsLoading}
              error={modelsError}
            />
          </div>
        </header>

        <div className="cp-messages">
          {messages.map((m) => (
            <div key={m.id} className={`cp-msg cp-msg--${m.type}`}>
              {m.type === "bot" && <div className="cp-avatar cp-avatar--bot">AI</div>}

              <div className="cp-bubble">
                {m.type === "user" && m.images && m.images.length > 0 && (
                  <div className="cp-bubble-images">
                    {m.images.map((src, i) => (
                      <a
                        key={i}
                        href={src}
                        target="_blank"
                        rel="noreferrer"
                        className="cp-bubble-image"
                      >
                        <img src={src} alt="" />
                      </a>
                    ))}
                  </div>
                )}
                {m.text && <p className="cp-bubble-text">{m.text}</p>}

                {m.type === "bot" && m.confidence > 0 && (
                  <div className="cp-meta">
                    <span
                      className={`cp-conf ${confidenceColor(m.confidence)}`}
                      title={
                        "Calculated from how strongly your answer is " +
                        "grounded in the cited sources, the answer's " +
                        "length, and any hedging language. Higher = the " +
                        "documents directly support the reply."
                      }
                    >
                      Confidence: {m.confidence}%
                    </span>
                    {m.citations && m.citations.length > 0 && (
                      <div className="cp-citations">
                        <span className="cp-cit-label">Sources:</span>
                        {m.citations.map((c, i) => (
                          <span key={i} className="cp-cit">
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {m.type === "user" && (
                <div className={`cp-avatar cp-avatar--user`}>
                  {userRole === "teacher" ? "T" : "S"}
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="cp-msg cp-msg--bot">
              <div className="cp-avatar cp-avatar--bot">AI</div>
              <div className="cp-bubble cp-bubble--typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {showSuggestions && (
          <div className="cp-suggestions">
            {suggestions.map((s) => (
              <button key={s} className="cp-sug-btn" onClick={() => setInput(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        {pendingImages.length > 0 && (
          <div className="cp-pending-images">
            {pendingImages.map((img) => (
              <div key={img.id} className="cp-pending-image">
                <img src={img.dataUrl} alt={img.name} />
                <button
                  type="button"
                  className="cp-pending-image__remove"
                  onClick={() => removePendingImage(img.id)}
                  aria-label={`Remove ${img.name}`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="cp-input-bar">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={handleImagePick}
          />
          <button
            type="button"
            className="cp-image-btn"
            onClick={() => imageInputRef.current?.click()}
            disabled={transcribing}
            aria-label="Attach images"
            title="Attach images"
          >
            <ImageIcon size={18} />
          </button>
          <textarea
            ref={textareaRef}
            className="cp-textarea"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={
              recording
                ? "Listening… click the mic again to stop."
                : transcribing
                ? "Transcribing your voice…"
                : userRole === "teacher"
                ? "Ask about curriculum, program structure, admin details…"
                : "Ask about your course, lessons, or assignments…"
            }
            disabled={transcribing}
          />
          <button
            type="button"
            className={`cp-mic-btn${
              recording ? " cp-mic-btn--recording" : ""
            }${transcribing ? " cp-mic-btn--transcribing" : ""}`}
            onClick={toggleRecording}
            disabled={transcribing}
            aria-label={
              recording
                ? `Stop recording (${recordingSeconds}s)`
                : transcribing
                ? "Transcribing"
                : "Record voice input"
            }
            title={
              recording
                ? `Stop & transcribe (${recordingSeconds}s)`
                : transcribing
                ? "Transcribing…"
                : "Voice input"
            }
          >
            {transcribing ? (
              <Loader2 size={18} className="cp-mic-spin" />
            ) : recording ? (
              // Live Siri-style wavy line driven by the active mic
              // stream. Falls back to the stop square if the stream
              // hasn't been promoted to React state yet (a single
              // frame, basically invisible).
              recordingStream ? (
                <MicWaveform stream={recordingStream} width={64} height={20} />
              ) : (
                <Square size={16} fill="currentColor" />
              )
            ) : (
              <>
                {/* Idle pulse: two soft concentric rings emanating
                    from behind the mic icon. Pure CSS, no JS. The
                    rings sit behind the icon (z-index: 0) and the
                    icon draws on top (z-index: 1). */}
                <span className="cp-mic-rings" aria-hidden="true">
                  <span className="cp-mic-ring" />
                  <span className="cp-mic-ring" />
                </span>
                <Mic size={18} className="cp-mic-icon" />
              </>
            )}
            {recording && (
              <span className="cp-mic-timer">
                {String(Math.floor(recordingSeconds / 60)).padStart(1, "0")}:
                {String(recordingSeconds % 60).padStart(2, "0")}
              </span>
            )}
          </button>
          <button
            className="cp-send-btn"
            onClick={send}
            disabled={
              (!input.trim() && pendingImages.length === 0) ||
              isTyping ||
              recording ||
              transcribing
            }
          >
            Send
          </button>
        </div>
        {voiceError && <div className="cp-voice-error">{voiceError}</div>}
      </main>
    </div>
  );
};

export default ChatPage;
