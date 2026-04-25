import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { adminLogin, getAdminToken } from "./api/admin";
import "./AdminLogin.css";

const AdminLogin = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (getAdminToken()) {
      navigate("/admin", { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password) {
      setError("Username and password are required.");
      return;
    }
    setSubmitting(true);
    try {
      await adminLogin({ username: username.trim(), password });
      navigate("/admin", { replace: true });
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="al-page">
      <form className="al-card" onSubmit={handleSubmit} autoComplete="off">
        <div className="al-brand">
          <span className="al-brand-icon">A</span>
          <div>
            <h1 className="al-title">Admin Console</h1>
            <p className="al-subtitle">Laboracle Operations</p>
          </div>
        </div>

        {error && <div className="al-error" role="alert">{error}</div>}

        <label className="al-field">
          <span className="al-label">Username</span>
          <input
            type="text"
            className="al-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Admin username"
            autoFocus
            disabled={submitting}
          />
        </label>

        <label className="al-field">
          <span className="al-label">Password</span>
          <input
            type="password"
            className="al-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            disabled={submitting}
          />
        </label>

        <button type="submit" className="al-submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in to dashboard"}
        </button>

        <div className="al-foot">
          <button
            type="button"
            className="al-link"
            onClick={() => navigate("/")}
          >
            ← Back to site
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminLogin;
