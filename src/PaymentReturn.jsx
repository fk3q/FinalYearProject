/**
 * Landing pages for Stripe checkout return.
 *
 * Success flow:
 *   1. Stripe redirects to /pay/success?session_id=cs_test_...
 *   2. Our backend has (or is about to) receive the webhook and set the user's tier.
 *   3. We re-fetch the profile so the UI shows the new tier immediately.
 *      If the webhook hasn't arrived yet we just show "your subscription is
 *      being processed" — harmless since Stripe guarantees delivery.
 */

import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getSessionUser, mergeSessionUser, fetchUserProfile } from './api/auth';
import './PaymentReturn.css';

export function PaymentSuccess() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = params.get('session_id');
  const [tier, setTier] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const user = getSessionUser();
    if (!user?.id) {
      setChecking(false);
      return;
    }
    // Poll the profile up to 8 times (webhook is usually near-instant in test mode,
    // but can take 1-3 seconds). Stop as soon as we see a non-free tier.
    let cancelled = false;
    let attempt = 0;
    const tick = async () => {
      if (cancelled) return;
      try {
        const profile = await fetchUserProfile(user.id);
        if (cancelled) return;
        const newTier = profile?.subscription_tier || 'free';
        mergeSessionUser({ subscription_tier: newTier });
        if (newTier !== 'free') {
          setTier(newTier);
          setChecking(false);
          return;
        }
      } catch {
        /* ignore transient errors and retry */
      }
      attempt += 1;
      if (attempt < 8) {
        setTimeout(tick, 1000);
      } else {
        setChecking(false);
      }
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="pay-return">
      <div className="pay-card pay-card--success">
        <div className="pay-icon" aria-hidden="true">✓</div>
        <h1>Payment successful</h1>
        {tier ? (
          <p>
            Welcome to the <strong>{tier.charAt(0).toUpperCase() + tier.slice(1)}</strong>{' '}
            plan. Your new features are unlocked and ready to use.
          </p>
        ) : checking ? (
          <p>
            Thanks — we&apos;re finalising your subscription. This usually takes a
            couple of seconds.
          </p>
        ) : (
          <p>
            Thanks! Your payment went through. If your plan hasn&apos;t updated in a
            minute, refresh this page or check your profile.
          </p>
        )}
        <div className="pay-actions">
          <button
            type="button"
            className="pay-btn pay-btn--primary"
            onClick={() => navigate('/chat')}
          >
            Start chatting
          </button>
          <Link to="/profile" className="pay-btn">
            View my profile
          </Link>
        </div>
        {sessionId && (
          <p className="pay-meta">Reference: <code>{sessionId}</code></p>
        )}
      </div>
    </div>
  );
}

export function PaymentCancel() {
  const navigate = useNavigate();
  return (
    <div className="pay-return">
      <div className="pay-card">
        <div className="pay-icon pay-icon--cancel" aria-hidden="true">!</div>
        <h1>Checkout cancelled</h1>
        <p>
          No charge was made. You can pick a plan again whenever you&apos;re ready.
        </p>
        <div className="pay-actions">
          <button
            type="button"
            className="pay-btn pay-btn--primary"
            onClick={() => navigate('/#pricing')}
          >
            Back to pricing
          </button>
          <Link to="/" className="pay-btn">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
