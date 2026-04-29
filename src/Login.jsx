import React, { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Auth.css";
import {
  facebookSignIn,
  googleSignIn,
  loginUser,
  microsoftSignIn,
  saveSessionUser,
} from "./api/auth";
import { useTheme } from "./contexts/ThemeContext";
import GoogleSignInButton from "./components/GoogleSignInButton";
import MicrosoftSignInButton from "./components/MicrosoftSignInButton";
import FacebookSignInButton from "./components/FacebookSignInButton";
import AuthPromoMotifs from "./components/AuthPromoMotifs";
import AuthPromoDots from "./components/AuthPromoDots";

const Login = () => {
  const navigate = useNavigate();
  const { applyTheme } = useTheme();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
  const [oauthBusy, setOauthBusy] = useState(false);

  const finishAuth = useCallback(
    (data) => {
      if (data?.user) {
        saveSessionUser(data.user);
        if (data.user.theme) applyTheme(data.user.theme);
      }
      // One-shot flag: tells ChatPage to play the AI-modes flash-card
      // walkthrough right after the cinematic intro video closes.
      // ChatPage clears the flag on mount so a refresh doesn't replay.
      try {
        sessionStorage.setItem("laboracle_show_modes_intro", "1");
      } catch {
        /* private mode / disabled storage -- silently skip the tour */
      }
      // Land returning users straight in the chat workspace; the
      // ChatPage mount triggers the cinematic intro on every visit.
      // Account / billing / settings remain accessible from the chat
      // sidebar.
      navigate("/chat");
    },
    [applyTheme, navigate],
  );

  const onGoogleCredential = useCallback(
    async (credential) => {
      setOauthBusy(true);
      setApiError("");
      try {
        const data = await googleSignIn({ credential });
        finishAuth(data);
      } catch (err) {
        setApiError(err.message || "Google sign-in failed");
      } finally {
        setOauthBusy(false);
      }
    },
    [finishAuth],
  );

  const onMicrosoftIdToken = useCallback(
    async (idToken) => {
      setOauthBusy(true);
      setApiError("");
      try {
        const data = await microsoftSignIn({ idToken });
        finishAuth(data);
      } catch (err) {
        setApiError(err.message || "Microsoft sign-in failed");
      } finally {
        setOauthBusy(false);
      }
    },
    [finishAuth],
  );

  const onFacebookToken = useCallback(
    async (accessToken) => {
      setOauthBusy(true);
      setApiError("");
      try {
        const data = await facebookSignIn({ accessToken });
        finishAuth(data);
      } catch (err) {
        setApiError(err.message || "Facebook sign-in failed");
      } finally {
        setOauthBusy(false);
      }
    },
    [finishAuth],
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
    if (apiError) setApiError("");
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.email) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Email is invalid";
    }
    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }
    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = validateForm();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setSubmitting(true);
    setApiError("");
    try {
      const data = await loginUser({
        email: formData.email.trim(),
        password: formData.password,
      });
      finishAuth(data);
    } catch (err) {
      setApiError(err.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <aside className="auth-promo">
        <AuthPromoDots />
        <AuthPromoMotifs />
        <div>
          <div className="auth-promo__brand">
            <div className="auth-promo__logo">
              <img src="/laboracle-logo.png" alt="" />
            </div>
            <span className="auth-promo__brandname">Laboracle</span>
          </div>
          <p className="auth-promo__date">Smart learning assistant</p>
        </div>

        <div className="auth-promo__hero">
          <p className="auth-promo__eyebrow">
            This is your study room. You should be in it.
          </p>
          <h2 className="auth-promo__title">
            Smarter
            <br />
            answers.
            <br />
            Cited sources.
          </h2>
          <p className="auth-promo__lead">
            Curriculum-aware help for students and lecturers — every reply
            backed by the source it came from.
          </p>
          <button
            type="button"
            className="auth-promo__cta"
            onClick={() => navigate("/")}
          >
            Explore Laboracle →
          </button>
        </div>

        <p className="auth-promo__footer">© 2026 Laboracle</p>
      </aside>

      <section className="auth-form-side">
        <div className="auth-form-card">
          <button
            type="button"
            className="auth-back-link"
            onClick={() => navigate("/")}
          >
            ← Back to Home
          </button>

          <div className="auth-form-card__brand">
            <img src="/laboracle-logo.png" alt="" />
            <span className="auth-form-card__brand-name">Laboracle</span>
          </div>
          <h1 className="auth-form-card__title">Log in to your account</h1>
          <p className="auth-form-card__subtitle">
            Welcome back — pick up where you left off.
          </p>

          {apiError ? (
            <div className="auth-banner-error" role="alert">
              {apiError}
            </div>
          ) : null}

          <div className="oauth-buttons">
            <GoogleSignInButton
              onCredential={onGoogleCredential}
              disabled={oauthBusy || submitting}
            />
            <MicrosoftSignInButton
              onIdToken={onMicrosoftIdToken}
              disabled={oauthBusy || submitting}
            />
            <FacebookSignInButton
              onAccessToken={onFacebookToken}
              disabled={oauthBusy || submitting}
            />
          </div>

          {oauthBusy ? <p className="oauth-busy">Signing in…</p> : null}

          <div className="oauth-divider">or</div>

          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="auth-input-group">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="you@example.com"
                className={`auth-input ${errors.email ? "has-error" : ""}`}
                autoComplete="email"
              />
              {errors.email && (
                <p className="auth-input-error">{errors.email}</p>
              )}
            </div>

            <div className="auth-input-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter your password"
                className={`auth-input ${errors.password ? "has-error" : ""}`}
                autoComplete="current-password"
              />
              {errors.password && (
                <p className="auth-input-error">{errors.password}</p>
              )}
            </div>

            <div className="auth-options-row">
              <label className="auth-checkbox">
                <input type="checkbox" />
                Remember me
              </label>
              <button
                type="button"
                className="auth-link-button"
                onClick={() => navigate("/forgot-password")}
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              className="auth-submit"
              disabled={submitting || oauthBusy}
            >
              {submitting ? "Signing in…" : "Continue"}
            </button>
          </form>

          <p className="auth-switch-row">
            Don&apos;t have an account?{" "}
            <button
              type="button"
              className="auth-link-button"
              onClick={() => navigate("/signup")}
            >
              Sign up
            </button>
          </p>
        </div>
      </section>
    </div>
  );
};

export default Login;
