import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Auth.css';
import { facebookSignIn, googleSignIn, registerUser, saveSessionUser } from './api/auth';
import { createCheckoutSession } from './api/payments';
import { useTheme } from './contexts/ThemeContext';
import GoogleSignInButton from './components/GoogleSignInButton';
import FacebookSignInButton from './components/FacebookSignInButton';

// Public site key. Cloudflare provides "always-passes" dummy keys so local dev
// works without an account. Override with VITE_TURNSTILE_SITE_KEY for production.
const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA';

const Signup = () => {
  const navigate = useNavigate();
  const { applyTheme } = useTheme();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [errors, setErrors] = useState({});
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
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
            setTurnstileToken(token || '');
            setErrors((prev) => (prev.captcha ? { ...prev, captcha: '' } : prev));
          },
          'expired-callback': () => setTurnstileToken(''),
          'error-callback': () => setTurnstileToken(''),
          theme: 'light',
        });
      } catch {
        /* ignore render errors */
      }
    };
    tryRender();
    return () => {
      cancelled = true;
      if (window.turnstile && turnstileWidgetIdRef.current) {
        try { window.turnstile.remove(turnstileWidgetIdRef.current); } catch { /* noop */ }
        turnstileWidgetIdRef.current = null;
      }
    };
  }, []);

  const resetTurnstile = () => {
    setTurnstileToken('');
    if (window.turnstile && turnstileWidgetIdRef.current) {
      try { window.turnstile.reset(turnstileWidgetIdRef.current); } catch { /* noop */ }
    }
  };

  const continueAfterAuth = useCallback(
    async (data) => {
      let pendingPlan = null;
      try {
        const raw = sessionStorage.getItem('laboracle_pending_plan');
        if (raw) pendingPlan = JSON.parse(raw);
      } catch {
        /* ignore */
      }
      sessionStorage.removeItem('laboracle_pending_plan');

      if (pendingPlan?.plan && data.user?.id) {
        try {
          const { url } = await createCheckoutSession({
            userId: data.user.id,
            plan: pendingPlan.plan,
            billing: pendingPlan.billing || 'monthly',
          });
          if (url) {
            window.location.href = url;
            return;
          }
        } catch (err) {
          setApiError(
            'Signed in, but we could not start checkout: ' +
              (err?.message || 'unknown error') +
              ' — you can try again from the Pricing page.'
          );
          navigate('/profile');
          return;
        }
      }
      navigate('/profile');
    },
    [navigate]
  );

  const onGoogleCredential = useCallback(
    async (credential) => {
      setGoogleBusy(true);
      setApiError('');
      try {
        const data = await googleSignIn({ credential });
        if (data.user) {
          saveSessionUser(data.user);
          if (data.user.theme) applyTheme(data.user.theme);
        }
        await continueAfterAuth(data);
      } catch (err) {
        setApiError(err.message || 'Google sign-in failed');
      } finally {
        setGoogleBusy(false);
      }
    },
    [applyTheme, continueAfterAuth]
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
    if (apiError) setApiError('');
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    } else if (formData.firstName.trim().length < 2) {
      newErrors.firstName = 'First name must be at least 2 characters';
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    } else if (formData.lastName.trim().length < 2) {
      newErrors.lastName = 'Last name must be at least 2 characters';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (formData.phone.replace(/\D/g, '').length < 8) {
      newErrors.phone = 'Enter a valid phone number';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (!agreedToTerms) {
      newErrors.terms = 'You must agree to the terms and conditions';
    }

    if (!turnstileToken) {
      newErrors.captcha = 'Please complete the captcha below.';
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
    setApiError('');
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
      setApiError(err.message || 'Could not create account');
      // The token is single-use, so failed attempts need a fresh challenge.
      resetTurnstile();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Create Account</h1>
          <p>Join Flosendo's Laboracle learning platform</p>
          <span className="auth-company">Ages 9-17 | Safe & Secure</span>
        </div>

        {apiError ? (
          <div className="auth-banner-error" role="alert">
            {apiError}
          </div>
        ) : null}

        <GoogleSignInButton onCredential={onGoogleCredential} disabled={oauthBusy || submitting} />
        <div className="oauth-row" style={{ marginTop: 8 }}>
          <FacebookSignInButton onAccessToken={onFacebookToken} disabled={oauthBusy || submitting} />
        </div>
        {oauthBusy ? (
          <p className="text-center" style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>
            Signing in…
          </p>
        ) : null}

        <div className="auth-divider">or sign up with email</div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="firstName">First Name</label>
            <input
              type="text"
              id="firstName"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              placeholder="First name"
              className={errors.firstName ? 'error' : ''}
              autoComplete="given-name"
            />
            {errors.firstName && <span className="error-message">{errors.firstName}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="lastName">Last Name</label>
            <input
              type="text"
              id="lastName"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              placeholder="Last name"
              className={errors.lastName ? 'error' : ''}
              autoComplete="family-name"
            />
            {errors.lastName && <span className="error-message">{errors.lastName}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="phone">Phone Number</label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="Phone number"
              className={errors.phone ? 'error' : ''}
              autoComplete="tel"
            />
            {errors.phone && <span className="error-message">{errors.phone}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="your.email@example.com"
              className={errors.email ? 'error' : ''}
              autoComplete="email"
            />
            {errors.email && <span className="error-message">{errors.email}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Create a password"
              className={errors.password ? 'error' : ''}
              autoComplete="new-password"
            />
            {errors.password && <span className="error-message">{errors.password}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Confirm your password"
              className={errors.confirmPassword ? 'error' : ''}
              autoComplete="new-password"
            />
            {errors.confirmPassword && <span className="error-message">{errors.confirmPassword}</span>}
          </div>

          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => {
                  setAgreedToTerms(e.target.checked);
                  if (errors.terms) {
                    setErrors(prev => ({ ...prev, terms: '' }));
                  }
                }}
              />
              <span>I agree to the <a href="#">Terms and Conditions</a></span>
            </label>
            {errors.terms && <span className="error-message">{errors.terms}</span>}
          </div>

          <div className="form-group">
            <div ref={turnstileContainerRef} className="turnstile-widget" />
            {errors.captcha && <span className="error-message">{errors.captcha}</span>}
          </div>

          <button type="submit" className="auth-button" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Sign Up'}
          </button>
        </form>

        <div className="auth-footer">
          <p>Already have an account? <span onClick={() => navigate('/login')} className="auth-link">Login</span></p>
        </div>

        <button onClick={() => navigate('/')} className="back-home-button" type="button">
          ← Back to Home
        </button>
      </div>
    </div>
  );
};

export default Signup;
