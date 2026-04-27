import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Auth.css";
import { requestPasswordReset, resetPassword } from "./api/auth";

const ForgotPassword = () => {
  const navigate = useNavigate();

  const [step, setStep] = useState("request"); // "request" | "reset" | "done"
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const clearMessages = () => {
    if (apiError) setApiError("");
    if (info) setInfo("");
  };

  const handleEmailChange = (e) => {
    setEmail(e.target.value);
    clearMessages();
    if (errors.email) setErrors((p) => ({ ...p, email: "" }));
  };

  const handleCodeChange = (e) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    clearMessages();
    if (errors.code) setErrors((p) => ({ ...p, code: "" }));
  };

  const handleNewPasswordChange = (e) => {
    setNewPassword(e.target.value);
    clearMessages();
    if (errors.newPassword) setErrors((p) => ({ ...p, newPassword: "" }));
  };

  const handleConfirmChange = (e) => {
    setConfirmPassword(e.target.value);
    clearMessages();
    if (errors.confirmPassword) setErrors((p) => ({ ...p, confirmPassword: "" }));
  };

  const submitEmail = async (e) => {
    e.preventDefault();
    const newErrors = {};
    const trimmed = email.trim();
    if (!trimmed) newErrors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(trimmed)) newErrors.email = "Email is invalid";
    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);
    setApiError("");
    try {
      await requestPasswordReset({ email: trimmed });
      setEmail(trimmed);
      setInfo(
        "If an account exists for that email, a 6-digit code has been sent. Check your inbox (and spam)."
      );
      setStep("reset");
    } catch (err) {
      setApiError(err.message || "Could not start password reset");
    } finally {
      setSubmitting(false);
    }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    const newErrors = {};
    if (code.length !== 6) newErrors.code = "Enter the 6-digit code from the email";
    if (!newPassword) newErrors.newPassword = "New password is required";
    else if (newPassword.length < 6)
      newErrors.newPassword = "Password must be at least 6 characters";
    if (!confirmPassword) newErrors.confirmPassword = "Please confirm your new password";
    else if (newPassword && newPassword !== confirmPassword)
      newErrors.confirmPassword = "Passwords do not match";
    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);
    setApiError("");
    try {
      await resetPassword({ email, code, newPassword });
      setStep("done");
      setInfo("Password updated. Redirecting to login…");
      setTimeout(() => navigate("/login", { replace: true }), 1800);
    } catch (err) {
      setApiError(err.message || "Could not reset password");
    } finally {
      setSubmitting(false);
    }
  };

  const resendCode = async () => {
    if (!email) return;
    setSubmitting(true);
    setApiError("");
    try {
      await requestPasswordReset({ email });
      setInfo("A new code has been sent if the email is registered.");
    } catch (err) {
      setApiError(err.message || "Could not resend code");
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
                type="button"
                className="btn btn-link p-0 mb-3 text-decoration-none"
                onClick={() => navigate("/login")}
              >
                ← Back to Login
              </button>

              <div className="text-center mb-4">
                <h1 className="h4 mb-1">
                  {step === "request" && "Forgot Password"}
                  {step === "reset" && "Enter your code"}
                  {step === "done" && "Password updated"}
                </h1>
                <p className="text-muted mb-2">
                  {step === "request" &&
                    "Enter your email and we'll send you a 6-digit verification code."}
                  {step === "reset" &&
                    "Enter the 6-digit code from your email and choose a new password."}
                  {step === "done" && "You can now sign in with your new password."}
                </p>
              </div>

              {apiError && (
                <div className="alert alert-danger py-2 small" role="alert">
                  {apiError}
                </div>
              )}
              {info && (
                <div className="alert alert-info py-2 small" role="status">
                  {info}
                </div>
              )}

              {step === "request" && (
                <form onSubmit={submitEmail} noValidate>
                  <div className="mb-3">
                    <label htmlFor="email" className="form-label">
                      Email Address
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={email}
                      onChange={handleEmailChange}
                      placeholder="Enter your email"
                      className={`form-control ${errors.email ? "is-invalid" : ""}`}
                      autoComplete="email"
                    />
                    {errors.email && (
                      <div className="invalid-feedback">{errors.email}</div>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary w-100"
                    disabled={submitting}
                  >
                    {submitting ? "Sending…" : "Send verification code"}
                  </button>
                </form>
              )}

              {step === "reset" && (
                <form onSubmit={submitReset} noValidate>
                  <div className="mb-3">
                    <label htmlFor="code" className="form-label">
                      6-digit code
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      id="code"
                      name="code"
                      value={code}
                      onChange={handleCodeChange}
                      placeholder="123456"
                      maxLength={6}
                      className={`form-control ${errors.code ? "is-invalid" : ""}`}
                      style={{ letterSpacing: "6px", fontSize: "20px", textAlign: "center" }}
                      autoComplete="one-time-code"
                    />
                    {errors.code && (
                      <div className="invalid-feedback">{errors.code}</div>
                    )}
                  </div>

                  <div className="mb-3">
                    <label htmlFor="newPassword" className="form-label">
                      New password
                    </label>
                    <input
                      type="password"
                      id="newPassword"
                      name="newPassword"
                      value={newPassword}
                      onChange={handleNewPasswordChange}
                      placeholder="At least 6 characters"
                      className={`form-control ${errors.newPassword ? "is-invalid" : ""}`}
                      autoComplete="new-password"
                    />
                    {errors.newPassword && (
                      <div className="invalid-feedback">{errors.newPassword}</div>
                    )}
                  </div>

                  <div className="mb-3">
                    <label htmlFor="confirmPassword" className="form-label">
                      Confirm new password
                    </label>
                    <input
                      type="password"
                      id="confirmPassword"
                      name="confirmPassword"
                      value={confirmPassword}
                      onChange={handleConfirmChange}
                      placeholder="Re-enter new password"
                      className={`form-control ${errors.confirmPassword ? "is-invalid" : ""}`}
                      autoComplete="new-password"
                    />
                    {errors.confirmPassword && (
                      <div className="invalid-feedback">{errors.confirmPassword}</div>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary w-100"
                    disabled={submitting}
                  >
                    {submitting ? "Updating…" : "Set new password"}
                  </button>

                  <div className="d-flex justify-content-between align-items-center mt-3">
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none"
                      onClick={() => {
                        setStep("request");
                        setCode("");
                        setApiError("");
                        setInfo("");
                      }}
                    >
                      Use a different email
                    </button>
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none"
                      onClick={resendCode}
                      disabled={submitting}
                    >
                      Resend code
                    </button>
                  </div>
                </form>
              )}

              {step === "done" && (
                <button
                  type="button"
                  className="btn btn-primary w-100"
                  onClick={() => navigate("/login", { replace: true })}
                >
                  Go to Login
                </button>
              )}

              <div className="text-center mt-4">
                <span className="text-muted">Remembered it? </span>
                <button
                  type="button"
                  className="btn btn-link p-0 text-decoration-none"
                  onClick={() => navigate("/login")}
                >
                  Sign in
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
