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
} from "lucide-react";
import {
  transcribeAudio,
  pickRecorderMimeType,
  MAX_RECORDING_SECONDS,
} from "./api/voice";
import AccountSidebarBlock from "./components/AccountSidebarBlock";
import AIModesIntro from "./components/AIModesIntro";
import ChatIntroVideo from "./components/ChatIntroVideo";
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

const WELCOME_MESSAGE = {
  id: 0,
  type: "bot",
  text: "Hello! I'm Laboracle. Ask me anything about the documents you've uploaded.",
  confidence: 100,
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
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const recordingStreamRef = useRef(null);

  // AI-modes flash-card walkthrough. We trigger it in two cases:
  //   1. A fresh login or signup just happened (sessionStorage flag set
  //      by Login.jsx / Signup.jsx). This is for new users coming
  //      through the auth flow.
  //   2. The user has never dismissed the tour on this device
  //      (localStorage flag absent). This catches existing users so
  //      they get to see the flash cards once after the feature ships.
  // Either way, once the carousel is dismissed we set the localStorage
  // flag so it never replays on this device again.
  const [showModesIntro, setShowModesIntro] = useState(false);
  const modesIntroPendingRef = useRef(false);
  useEffect(() => {
    try {
      const fromAuth = sessionStorage.getItem("laboracle_show_modes_intro") === "1";
      const tourDone = localStorage.getItem("laboracle_modes_tour_done") === "1";
      if (fromAuth) {
        sessionStorage.removeItem("laboracle_show_modes_intro");
      }
      if (fromAuth || !tourDone) {
        modesIntroPendingRef.current = true;
      }
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

  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);

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
    if (!query) return;

    const userMsg = { id: Date.now(), type: "user", text: query };
    setMessages((p) => [...p, userMsg]);
    setInput("");
    setIsTyping(true);

    try {
      const body = {
        query,
        mode: aiMode,
        user_role: userRole,
      };
      if (sessionId) body.session_id = sessionId;
      if (selectedModelId) body.model = selectedModelId;

      const res = await fetch(`${getApiBase()}/api/chat/query`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Query failed");
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
      setMessages((p) => [
        ...p,
        {
          id: Date.now() + 1,
          type: "bot",
          text: `Error: ${err.message}. Please make sure the backend is running and documents have been uploaded.`,
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
      <aside className="cp-sidebar">
        <div className="cp-brand" onClick={() => navigate("/")}>
          {/* Round logo badge with the same purple-bubble motif used in
              the marketing navbar. The badge clips the logo into a
              circle and the bubble spans rise from the bottom of the
              badge through and above the logo. The bubbles container
              has overflow:visible so they trail upward off the disc. */}
          <span className="cp-brand-circle">
            <img
              src="/laboracle-logo.png"
              alt="Laboracle"
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
        </div>

        <nav className="cp-nav">
          <button className="cp-nav-item" onClick={() => navigate("/upload")}>
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
                onClick={startNewChat}
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
                      onClick={() => openSession(s.id)}
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
            <button type="button" className="cp-history-link" onClick={() => navigate("/login")}>
              Sign in
            </button>{" "}
            to save and reopen your chats.
          </p>
        )}

        <AccountSidebarBlock variant="cp" />

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
          <button className="cp-nav-item" onClick={() => navigate("/profile")}>
            <span className="cp-nav-icon"><User /></span> Profile
          </button>
          <button
            className="cp-nav-item"
            onClick={() => navigate("/profile#settings")}
          >
            <span className="cp-nav-icon"><SettingsIcon /></span> Settings
          </button>
          <button
            className="cp-nav-item"
            onClick={() => navigate("/profile#subscription")}
          >
            <span className="cp-nav-icon"><CreditCard /></span> Subscription
          </button>
        </nav>

        <div className="cp-section-label">Help</div>
        <nav className="cp-nav">
          <button
            className="cp-nav-item"
            onClick={() => {
              window.location.href = "mailto:laboraclee@gmail.com?subject=Help%20centre%20enquiry";
            }}
          >
            <span className="cp-nav-icon"><LifeBuoy /></span> Help centre
          </button>
          <button
            className="cp-nav-item"
            onClick={() => {
              window.location.href = "mailto:laboraclee@gmail.com?subject=Support%20request";
            }}
          >
            <span className="cp-nav-icon"><Headphones /></span> Support
          </button>
        </nav>
      </aside>

      <main className="cp-main">
        <header className="cp-header">
          <div className="cp-header-left">
            <div className="cp-ai-avatar">AI</div>
            <div>
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
                <p className="cp-bubble-text">{m.text}</p>

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

        <div className="cp-input-bar">
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
              <Square size={16} fill="currentColor" />
            ) : (
              <Mic size={18} />
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
            disabled={!input.trim() || isTyping || recording || transcribing}
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
