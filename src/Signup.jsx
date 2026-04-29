import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Auth.css";
import {
  facebookSignIn,
  googleSignIn,
  microsoftSignIn,
  registerUser,
  saveSessionUser,
} from "./api/auth";
import { createCheckoutSession } from "./api/payments";
import { useTheme } from "./contexts/ThemeContext";
import GoogleSignInButton from "./components/GoogleSignInButton";
import MicrosoftSignInButton from "./components/MicrosoftSignInButton";
import FacebookSignInButton from "./components/FacebookSignInButton";

// Public site key. Cloudflare provides "always-passes" dummy keys so local dev
// works without an account. Override with VITE_TURNSTILE_SITE_KEY for production.
const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY || "1x00000000000000000000AA";

const Signup = () => {
  const navigate = useNavigate();
  const { applyTheme } = useTheme();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState({});
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [oauthBusy, setOauthBusy] = useState(false);
  const turnstileContainerRef = useRef(null);
  const turnstileWidgetIdRef = useRef(null);

  // Render the Turnstile widget once the Cloudflare script is available. We
  // poll briefly because the script is loaded with `async defer` in index.html.
  useEffect(() => {
    let cancelled = false;
    const tryRender = () => {
      if (cancelled) return;
      const container = turnstileContainerRef.current;
      if (!window.turnstile || !container) {
        setTimeout(tryRender, 200);
        return;
      }
      if (turnstileWidgetIdRef.current) return;
      try {
        turnstileWidgetIdRef.current = window.turnstile.render(container, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token) => {
            setTurnstileToken(token || "");
            setErrors((prev) => (prev.captcha ? { ...prev, captcha: "" } : prev));
          },
          "expired-callback": () => setTurnstileToken(""),
          "error-callback": () => setTurnstileToken(""),
          theme: "light",
        });
      } catch {
        /* ignore render errors */
      }
    };
    tryRender();
    return () => {
      cancelled = true;
      if (window.turnstile && turnstileWidgetIdRef.current) {
        try {
          window.turnstile.remove(turnstileWidgetIdRef.current);
        } catch {
          /* noop */
        }
        turnstileWidgetIdRef.current = null;
      }
    };
  }, []);

  const resetTurnstile = () => {
    setTurnstileToken("");
    if (window.turnstile && turnstileWidgetIdRef.current) {
      try {
        window.turnstile.reset(turnstileWidgetIdRef.current);
      } catch {
        /* noop */
      }
    }
  };

  const continueAfterAuth = useCallback(
    async (data) => {
      let pendingPlan = null;
      try {
        const raw = sessionStorage.getItem("laboracle_pending_plan");
        if (raw) pendingPlan = JSON.parse(raw);
      } catch {
        /* ignore */
      }
      sessionStorage.removeItem("laboracle_pending_plan");

      if (pendingPlan?.plan && data.user?.id) {
        try {
          const { url } = await createCheckoutSession({
            plan: pendingPlan.plan,
            billing: pendingPlan.billing || "monthly",
          });
          if (url) {
            window.location.href = url;
            return;
          }
        } catch (err) {
          setApiError(
            "Signed in, but we could not start checkout: " +
              (err?.message || "unknown error") +
              " — you can try again from the Pricing page.",
          );
          navigate("/profile");
          return;
        }
      }
      navigate("/profile");
    },
    [navigate],
  );

  const finishOAuth = useCallback(
    async (data) => {
      if (data?.user) {
        saveSessionUser(data.user);
        if (data.user.theme) applyTheme(data.user.theme);
      }
      await continueAfterAuth(data);
    },
    [applyTheme, continueAfterAuth],
  );

  const onGoogleCredential = useCallback(
    async (credential) => {
      setOauthBusy(true);
      setApiError("");
      try {
        const data = await googleSignIn({ credential });
        await finishOAuth(data);
      } catch (err) {
        setApiError(err.message || "Google sign-in failed");
      } finally {
        setOauthBusy(false);
      }
    },
    [finishOAuth],
  );

  const onMicrosoftIdToken = useCallback(
    async (idToken) => {
      setOauthBusy(true);
      setApiError("");
      try {
        const data = await microsoftSignIn({ idToken });
        await finishOAuth(data);
      } catch (err) {
        setApiError(err.message || "Microsoft sign-in failed");
      } finally {
        setOauthBusy(false);
      }
    },
    [finishOAuth],
  );

  const onFacebookToken = useCallback(
    async (accessToken) => {
      setOauthBusy(true);
      setApiError("");
      try {
        const data = await facebookSignIn({ accessToken });
        await finishOAuth(data);
      } catch (err) {
        setApiError(err.message || "Facebook sign-in failed");
      } finally {
        setOauthBusy(false);
      }
    },
    [finishOAuth],
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
    if (apiError) setApiError("");
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.firstName.trim()) {
      newErrors.firstName = "First name is required";
    } else if (formData.firstName.trim().length < 2) {
      newErrors.firstName = "First name must be at least 2 characters";
    }
    if (!formData.lastName.trim()) {
      newErrors.lastName = "Last name is required";
    } else if (formData.lastName.trim().length < 2) {
      newErrors.lastName = "Last name must be at least 2 characters";
    }
    if (!formData.phone.trim()) {
      newErrors.phone = "Phone number is required";
    } else if (formData.phone.replace(/\D/g, "").length < 8) {
      newErrors.phone = "Enter a valid phone number";
    }
    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Email is invalid";
    }
    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password";
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }
    if (!agreedToTerms) {
      newErrors.terms = "You must agree to the terms and conditions";
    }
    if (!turnstileToken) {
      newErrors.captcha = "Please complete the captcha below.";
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
      const data = await registerUser({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        password: formData.password,
        turnstileToken,
      });
      if (data.user) {
        saveSessionUser(data.user);
        if (data.user.theme) applyTheme(data.user.theme);
      }
      await continueAfterAuth(data);
    } catch (err) {
      setApiError(err.message || "Could not create account");
      resetTurnstile();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <aside className="auth-promo">
        <div>
          <div className="auth-promo__brand">
            <div className="auth-promo__logo">
              <img src="/laboracle-logo.png" alt="" />
            </div>
            <span className="auth-promo__brandname">Laboracle</span>
          </div>
          <p className="auth-promo__date">
            Free for students &amp; lecturers
            <br />
            Ages 9-17 · Safe by default
          </p>
        </div>

        <div className="auth-promo__hero">
          <p className="auth-promo__eyebrow">
            Join the next generation of learners.
          </p>
          <h2 className="auth-promo__title">
            Create
            <br />
            your study
            <br />
            account.
          </h2>
          <p className="auth-promo__lead">
            Curriculum-aware answers, citation-backed by default — built for
            classrooms and home study.
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
          <h1 className="auth-form-card__title">Create your account</h1>
          <p className="auth-form-card__subtitle">
            It only takes a minute to get started.
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

          <div className="oauth-divider">or sign up with email</div>

          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="signup-name-row">
              <div className="auth-input-group">
                <label htmlFor="firstName">First name</label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={handleChange}
                  placeholder="First name"
                  className={`auth-input ${errors.firstName ? "has-error" : ""}`}
                  autoComplete="given-name"
                />
                {errors.firstName && (
                  <p className="auth-input-error">{errors.firstName}</p>
                )}
              </div>
              <div className="auth-input-group">
                <label htmlFor="lastName">Last name</label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={handleChange}
                  placeholder="Last name"
                  className={`auth-input ${errors.lastName ? "has-error" : ""}`}
                  autoComplete="family-name"
                />
                {errors.lastName && (
                  <p className="auth-input-error">{errors.lastName}</p>
                )}
              </div>
            </div>

            <div className="auth-input-group">
              <label htmlFor="phone">Phone number</label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                placeholder="Phone number"
                className={`auth-input ${errors.phone ? "has-error" : ""}`}
                autoComplete="tel"
              />
              {errors.phone && (
                <p className="auth-input-error">{errors.phone}</p>
              )}
            </div>

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
                placeholder="Create a password"
                className={`auth-input ${errors.password ? "has-error" : ""}`}
                autoComplete="new-password"
              />
              {errors.password && (
                <p className="auth-input-error">{errors.password}</p>
              )}
            </div>

            <div className="auth-input-group">
              <label htmlFor="confirmPassword">Confirm password</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm your password"
                className={`auth-input ${errors.confirmPassword ? "has-error" : ""}`}
                autoComplete="new-password"
              />
              {errors.confirmPassword && (
                <p className="auth-input-error">{errors.confirmPassword}</p>
              )}
            </div>

            <label className="auth-checkbox auth-terms-row">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => {
                  setAgreedToTerms(e.target.checked);
                  if (errors.terms) {
                    setErrors((prev) => ({ ...prev, terms: "" }));
                  }
                }}
              />
              <span>
                I agree to the{" "}
                <a href="#" className="auth-inline-link">
                  Terms and Conditions
                </a>
              </span>
            </label>
            {errors.terms && (
              <p className="auth-input-error">{errors.terms}</p>
            )}

            <div ref={turnstileContainerRef} className="turnstile-widget" />
            {errors.captcha && (
              <p className="auth-input-error">{errors.captcha}</p>
            )}

            <button
              type="submit"
              className="auth-submit"
              disabled={submitting || oauthBusy}
            >
              {submitting ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="auth-switch-row">
            Already have an account?{" "}
            <button
              type="button"
              className="auth-link-button"
              onClick={() => navigate("/login")}
            >
              Log in
            </button>
          </p>
        </div>
      </section>
    </div>
  );
};

export default Signup;
