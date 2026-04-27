import React, { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Auth.css"; // im keeping this but slides will i am keeping for bootstrap
import { facebookSignIn, googleSignIn, loginUser, saveSessionUser } from "./api/auth";
import { useTheme } from "./contexts/ThemeContext";
import GoogleSignInButton from "./components/GoogleSignInButton";
import FacebookSignInButton from "./components/FacebookSignInButton";

const Login = () => {
  const navigate = useNavigate();
  const { applyTheme } = useTheme();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
  const [oauthBusy, setOauthBusy] = useState(false);

  const onGoogleCredential = useCallback(
    async (credential) => {
      setOauthBusy(true);
      setApiError("");
      try {
        const data = await googleSignIn({ credential });
        if (data.user) {
          saveSessionUser(data.user);
          if (data.user.theme) applyTheme(data.user.theme);
        }
        navigate("/profile");
      } catch (err) {
        setApiError(err.message || "Google sign-in failed");
      } finally {
        setOauthBusy(false);
      }
    },
    [applyTheme, navigate]
  );

  const onFacebookToken = useCallback(
    async (accessToken) => {
      setOauthBusy(true);
      setApiError("");
      try {
        const data = await facebookSignIn({ accessToken });
        if (data.user) {
          saveSessionUser(data.user);
          if (data.user.theme) applyTheme(data.user.theme);
        }
        navigate("/profile");
      } catch (err) {
        setApiError(err.message || "Facebook sign-in failed");
      } finally {
        setOauthBusy(false);
      }
    },
    [applyTheme, navigate]
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // when user starts typing this will show changes in real time 
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
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
      if (data.user) {
        saveSessionUser(data.user);
        if (data.user.theme) applyTheme(data.user.theme);
      }
      navigate("/profile");
    } catch (err) {
      setApiError(err.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-12 col-sm-10 col-md-7 col-lg-5">
          <div className="card shadow-sm border-0">
            <div className="card-body p-4">
              <button
                onClick={() => navigate("/")}
                type="button"
                className="btn btn-link p-0 mb-3 text-decoration-none"
              >
                ← Back to Home
              </button>

              <div className="text-center mb-4">
                <h1 className="h4 mb-1">Welcome Back</h1>
                <p className="text-muted mb-2">
                  Login to access your Laboracle
                </p>
                <span className="badge text-bg-light">Flosendo Learning Platform</span>
              </div>

              {apiError ? (
                <div className="alert alert-danger py-2 small" role="alert">
                  {apiError}
                </div>
              ) : null}

              <GoogleSignInButton onCredential={onGoogleCredential} disabled={oauthBusy || submitting} />
              <div className="mt-2 oauth-row">
                <FacebookSignInButton onAccessToken={onFacebookToken} disabled={oauthBusy || submitting} />
              </div>
              {oauthBusy ? (
                <p className="text-center text-muted small mt-2 mb-0">Signing in…</p>
              ) : null}

              <div className="auth-divider">or email</div>

              <form onSubmit={handleSubmit} noValidate>
                {/* Email */}
                <div className="mb-3">
                  <label htmlFor="email" className="form-label">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Enter your email"
                    className={`form-control ${errors.email ? "is-invalid" : ""}`}
                    autoComplete="email"
                  />
                  {errors.email && (
                    <div className="invalid-feedback">{errors.email}</div>
                  )}
                </div>

                {/* Password */}
                <div className="mb-3">
                  <label htmlFor="password" className="form-label">
                    Password
                  </label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Enter your password"
                    className={`form-control ${errors.password ? "is-invalid" : ""}`}
                    autoComplete="current-password"
                  />
                  {errors.password && (
                    <div className="invalid-feedback">{errors.password}</div>
                  )}
                </div>

                {/* Options */}
                <div className="d-flex justify-content-between align-items-center mb-4">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="rememberMe"
                    />
                    <label className="form-check-label" htmlFor="rememberMe">
                      Remember me
                    </label>
                  </div>

                  <button
                    type="button"
                    className="btn btn-link p-0 text-decoration-none"
                    onClick={() => navigate("/forgot-password")}
                  >
                    Forgot Password?
                  </button>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  className="btn btn-primary w-100"
                  disabled={submitting}
                >
                  {submitting ? "Signing in…" : "Login"}
                </button>
              </form>

              <div className="text-center mt-4">
                <span className="text-muted">Don't have an account? </span>
                <button
                  type="button"
                  className="btn btn-link p-0 text-decoration-none"
                  onClick={() => navigate("/signup")}
                >
                  Sign Up
                </button>
              </div>
            </div>
          </div>

          <p className="text-center text-muted mt-3 mb-0" style={{ fontSize: 13 }}>
            by Flosendo Limited
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
