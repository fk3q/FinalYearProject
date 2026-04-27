import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './MainPage.css';
import { getSessionUser } from './api/auth';
import { createCheckoutSession } from './api/payments';

// Pricing plans. Regular is the free default tier — no payment, just a signup.
// Advanced is the only paid tier and goes through Stripe Checkout.
const PLANS = [
  {
    id: 'regular',
    name: 'Regular',
    tagline: 'Free forever',
    free: true,
    featured: false,
    cta: 'Get started free',
    features: [
      '50 questions per month',
      'Course Q&A with citations',
      'Upload up to 5 documents',
      'Standard response time',
      'Email support',
    ],
  },
  {
    id: 'advanced',
    name: 'Advanced',
    tagline: 'For power users',
    monthly: 0.99,
    yearly: 9.99, // ~17% discount (2 months free)
    featured: true,
    cta: 'Subscribe',
    features: [
      'Unlimited questions',
      'Course Q&A with citations',
      'Unlimited document uploads',
      'Priority response time',
      'Priority support',
      'Early access to new features',
    ],
  },
];

const MainPage = () => {
  const navigate = useNavigate();
  const [billing, setBilling] = useState('monthly'); // 'monthly' | 'yearly'
  const [checkoutLoading, setCheckoutLoading] = useState(null); // plan id currently checking out
  const [checkoutError, setCheckoutError] = useState('');

  const handleSelectPlan = async (planId) => {
    setCheckoutError('');
    const plan = PLANS.find((p) => p.id === planId);
    const user = getSessionUser();

    // Free plan — no Stripe involved. Just send them to signup (or to the app
    // if they're already signed in, since they already have free access).
    if (plan?.free) {
      navigate(user?.id ? '/chat' : '/signup');
      return;
    }

    // Paid plan — need to be signed in before we can create a Stripe customer.
    if (!user || !user.id) {
      try {
        sessionStorage.setItem(
          'laboracle_pending_plan',
          JSON.stringify({ plan: planId, billing })
        );
      } catch {
        /* storage might be full / blocked — safe to ignore */
      }
      navigate('/signup');
      return;
    }

    setCheckoutLoading(planId);
    try {
      const { url } = await createCheckoutSession({
        userId: user.id,
        plan: planId,
        billing,
      });
      if (url) {
        window.location.href = url;
      } else {
        throw new Error('No checkout URL returned from the server.');
      }
    } catch (err) {
      setCheckoutError(err?.message || 'Could not start checkout.');
      setCheckoutLoading(null);
    }
  };

  return (

    
    <div className="main-page">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="logo" onClick={() => navigate('/')}>
            <img src="/laboracle-logo.png" alt="Laboracle" className="logo-img" />
          </div>
          <nav className="nav-links">
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#pricing">Pricing</a>
            <a href="#about">About</a>
          </nav>
          <div className="auth-buttons">
            <button onClick={() => navigate('/login')} className="login-btn">
              Login
            </button>
            <button onClick={() => navigate('/signup')} className="signup-btn">
              Sign Up
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">
            Your Smart Learning Assistant
          </h1>
          <p className="hero-subtitle">
            Ask questions about your courses, curriculum, and program details. Get accurate answers 
            with citations powered by safe, low-hallucination AI technology.
          </p>
          <div className="hero-buttons">
            <button onClick={() => navigate('/signup')} className="cta-primary">
              Get Started Free
            </button>
            <button onClick={() => navigate('/upload')} className="cta-secondary">
              Try Demo
            </button>
          </div>
          <div className="hero-stats">
            <div className="stat">
              <span className="stat-number">1000+</span>
              <span className="stat-label">Students Helped</span>
            </div>
            <div className="stat">
              <span className="stat-number">95%</span>
              <span className="stat-label">Citation Accuracy</span>
            </div>
            <div className="stat">
              <span className="stat-number">24/7</span>
              <span className="stat-label">Always Available</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features">
        <h2 className="section-title">Powerful Features</h2>
        <div className="features-grid">
          <div className="feature-card">
            <h3>Course Q&A</h3>
            <p>Get instant answers about your entrepreneurship and financial literacy curriculum with accurate citations.</p>
          </div>
          <div className="feature-card">
            <h3>Low-Hallucination AI</h3>
            <p>Safe, reliable answers with confidence scores. Only responds when it has verified information.</p>
          </div>
          <div className="feature-card">
            <h3>Citation-Backed</h3>
            <p>Every answer includes source citations so you can verify information and learn more.</p>
          </div>
          <div className="feature-card">
            <h3>Dual Modes</h3>
            <p>Switch between deterministic mode for facts and exploratory mode for creative learning.</p>
          </div>
          <div className="feature-card">
            <h3>Teacher-Friendly</h3>
            <p>Reduces teacher workload while keeping students engaged and on track with their missions.</p>
          </div>
          <div className="feature-card">
            <h3>Student-Safe</h3>
            <p>Built with safety guardrails and age-appropriate content filtering for K12 students.</p>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="how-it-works">
        <h2 className="section-title">How It Works</h2>
        <div className="steps">
          <div className="step">
            <div className="step-number">1</div>
            <h3>Ask Your Question</h3>
            <p>Type any question about your course, curriculum, or program administration.</p>
          </div>
          <div className="step-arrow">→</div>
          <div className="step">
            <div className="step-number">2</div>
            <h3>AI Retrieval</h3>
            <p>Our system searches the curriculum database and retrieves relevant information.</p>
          </div>
          <div className="step-arrow">→</div>
          <div className="step">
            <div className="step-number">3</div>
            <h3>Get Cited Answers</h3>
            <p>Receive accurate answers with source citations and confidence scores.</p>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="pricing">
        <h2 className="section-title">Pricing plans</h2>
        <p className="pricing-subtitle">
          Choose the plan that works best for your learning journey
        </p>

        <div className="billing-toggle" role="tablist" aria-label="Billing cycle">
          <button
            type="button"
            role="tab"
            aria-selected={billing === 'monthly'}
            className={`billing-option ${billing === 'monthly' ? 'is-active' : ''}`}
            onClick={() => setBilling('monthly')}
          >
            Monthly
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={billing === 'yearly'}
            className={`billing-option ${billing === 'yearly' ? 'is-active' : ''}`}
            onClick={() => setBilling('yearly')}
          >
            Yearly
          </button>
        </div>

        <div className="pricing-grid">
          {PLANS.map((plan) => {
            const isFree = plan.free === true;
            const price = isFree ? 0 : (billing === 'monthly' ? plan.monthly : plan.yearly);
            const period = isFree
              ? 'forever'
              : billing === 'monthly' ? 'per month' : 'per year';
            return (
              <div
                key={plan.id}
                className={`pricing-card ${plan.featured ? 'is-featured' : ''}`}
              >
                <div className="pricing-card-head">
                  <h3 className="pricing-name">{plan.name.toUpperCase()}</h3>
                  {plan.featured && (
                    <span className="pricing-badge">Most Popular</span>
                  )}
                </div>

                {isFree ? (
                  <div className="pricing-price">
                    <span className="pricing-amount">Free</span>
                  </div>
                ) : (
                  <div className="pricing-price">
                    <span className="pricing-currency">£</span>
                    <span className="pricing-amount">{price.toFixed(2)}</span>
                  </div>
                )}
                <div className="pricing-period">{period}</div>
                <div className="pricing-tagline">{plan.tagline}</div>

                <ul className="pricing-features">
                  {plan.features.map((feat) => (
                    <li key={feat}>
                      <span className="pricing-check" aria-hidden="true">✓</span>
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  className={`pricing-cta ${plan.featured ? 'pricing-cta--primary' : ''}`}
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={checkoutLoading !== null}
                >
                  {checkoutLoading === plan.id
                    ? 'Redirecting…'
                    : (plan.cta || 'Subscribe')}
                </button>
              </div>
            );
          })}
        </div>

        {checkoutError && (
          <p className="pricing-error" role="alert">
            {checkoutError}
          </p>
        )}

        <p className="pricing-footnote">
          Secure payments powered by Stripe. Cancel any time from your profile.
        </p>
      </section>

      {/* About Section */}
      <section id="about" className="about">
        <div className="about-content">
          <h2 className="section-title">About Laboracle</h2>
          <p>
            Laboracle is a safe, intelligent learning assistant designed specifically 
            for K12 students (ages 9-17). Built for entrepreneurship accelerator and gamified financial 
            literacy courses, it helps students stay on track during online missions and classroom blocks.
          </p>
          <p>
            Using advanced RAG technology with citation verification and low-hallucination safeguards, 
            Laboracle reduces teacher workload while ensuring students get accurate, age-appropriate 
            answers to their course questions. Every answer includes source citations for transparency and trust.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-content">
          <div className="footer-section">
            <h3>Laboracle</h3>
            <p>Your smart learning companion</p>
            <div className="social-links">
              <a href="#">Twitter</a>
              <a href="#">LinkedIn</a>
              <a href="#">GitHub</a>
            </div>
          </div>
          <div className="footer-section">
            <h4>Product</h4>
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#pricing">Pricing</a>
            <a href="#">FAQ</a>
          </div>
          <div className="footer-section">
            <h4>Company</h4>
            <a href="#about">About</a>
            <a href="#">Blog</a>
            <a href="#">Careers</a>
            <a href="#">Contact</a>
          </div>
          <div className="footer-section">
            <h4>Legal</h4>
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">Cookie Policy</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2026 Laboracle. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default MainPage;
