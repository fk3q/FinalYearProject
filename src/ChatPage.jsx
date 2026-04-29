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
} from "lucide-react";
import AccountSidebarBlock from "./components/AccountSidebarBlock";
import { useUsageTracker } from "./hooks/useUsageTracker";
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

  const suggestions = [
    "What is this course about?",
    "Summarise the key topics",
    "What are the main objectives?",
    "Explain the program structure",
  ];

  const showSuggestions =
    messages.length === 1 && messages[0]?.id === WELCOME_MESSAGE.id && !sessionId;

  return (
    <div className="cp-page">
      <aside className="cp-sidebar">
        <div className="cp-brand" onClick={() => navigate("/")}>
          <img src="/laboracle-logo.png" alt="Laboracle" className="cp-brand-logo" />
        </div>

        <nav className="cp-nav">
          <button className="cp-nav-item" onClick={() => navigate("/upload")}>
            <span className="cp-nav-icon"><Upload /></span> Upload Documents
          </button>
          <button className="cp-nav-item active">
            <span className="cp-nav-icon"><MessageSquare /></span> Chat with AI
          </button>
        </nav>

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
            Teacher
          </button>
        </div>

        <div className="cp-section-label">AI Mode</div>
        <div className="cp-toggle-group">
          <button
            className={`cp-toggle ${aiMode === "deterministic" ? "cp-toggle--on" : ""}`}
            onClick={() => setAiMode("deterministic")}
            title="Factual answers from verified sources only"
          >
            Deterministic
          </button>
          <button
            className={`cp-toggle ${aiMode === "exploratory" ? "cp-toggle--on" : ""}`}
            onClick={() => setAiMode("exploratory")}
            title="Creative connections and broader insights"
          >
            Exploratory
          </button>
        </div>

        <div className="cp-mode-hint">
          {aiMode === "deterministic"
            ? "Answers are grounded strictly in your uploaded documents."
            : "AI explores connections beyond the documents."}
        </div>
      </aside>

      <main className="cp-main">
        <header className="cp-header">
          <div className="cp-header-left">
            <div className="cp-ai-avatar">AI</div>
            <div>
              <div className="cp-header-title">Laboracle</div>
              <div className="cp-header-sub">
                {aiMode === "deterministic" ? "Deterministic" : "Exploratory"} &bull;{" "}
                {userRole === "student" ? "Student" : "Teacher"} mode
              </div>
            </div>
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
                    <span className={`cp-conf ${confidenceColor(m.confidence)}`}>
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
              userRole === "teacher"
                ? "Ask about curriculum, program structure, admin details…"
                : "Ask about your course, lessons, or assignments…"
            }
          />
          <button
            className="cp-send-btn"
            onClick={send}
            disabled={!input.trim() || isTyping}
          >
            Send
          </button>
        </div>
      </main>
    </div>
  );
};

export default ChatPage;
