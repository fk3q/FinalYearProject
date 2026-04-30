import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight,
  BookMarked,
  BookOpen,
  GraduationCap,
  Heart,
  Library,
  Lightbulb,
  ListChecks,
  MessageCircleQuestion,
  Mic,
  Notebook,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  GithubIcon,
  InstagramIcon,
  LinkedinIcon,
  XIcon,
} from './components/SocialIcons';
import './MainPage.css';
import { clearSessionUser, getSessionUser } from './api/auth';
import { createCheckoutSession } from './api/payments';

// Bento-grid feature cards rendered in the "Powerful Features" section.
// `accent` controls the icon-pill colour via per-class CSS rules; `wide`
// makes the card span 2 grid columns to break the rhythm. With 9 cards
// the layout reads as three rows of (wide + narrow + narrow), with the
// wide card sliding from left → right → right across the rows to keep
// the rhythm interesting:
//   row 1: wide   | narrow | narrow
//   row 2: narrow | narrow | wide
//   row 3: narrow | narrow | wide
const FEATURES = [
  {
    icon: MessageCircleQuestion,
    title: 'Course Q&A',
    body: 'Ask anything about your uploaded notes, lecture slides or textbook chapters. Every answer comes back with citations pointing to the exact page.',
    accent: 'indigo',
    wide: true,
  },
  {
    icon: ShieldCheck,
    title: 'Low-Hallucination AI',
    body:
      'A confidence score on every reply — a transparent heuristic from retrieval similarity, answer length and hedging language (not a raw model probability).',
    accent: 'emerald',
  },
  {
    icon: BookMarked,
    title: 'Page-Level Citations',
    body: 'Citations link back to the exact passage and page number in your file, so you can verify any claim in seconds.',
    accent: 'amber',
  },
  {
    icon: ArrowLeftRight,
    title: 'Four AI Modes',
    body: 'Deterministic for facts, Exploratory for connections, Test for quizzes, Research for academic synthesis — switch in one click.',
    accent: 'cyan',
  },
  {
    icon: ListChecks,
    title: 'Test Yourself',
    body: 'Generate MCQ, short-answer and true/false quizzes from your own uploads, complete with answer keys and explanations.',
    accent: 'violet',
  },
  {
    icon: Mic,
    title: 'Voice Input',
    body: 'Tap the mic and speak your question — Whisper transcribes it into the chat box, perfect for hands-busy revision sessions.',
    accent: 'rose',
    wide: true,
  },
  {
    icon: Sparkles,
    title: 'Multi-Model AI',
    body: 'Choose between GPT-4o, GPT-5, Claude Opus 4.7, Claude Sonnet 4.6, Gemini 2.5 Flash and Gemini 2.5 Pro for the answer style you need.',
    accent: 'fuchsia',
  },
  {
    icon: Notebook,
    title: 'Research Toolkit',
    body: 'Cornell notes, lit-review drafts, methodology extraction and follow-up research questions for university-level work.',
    accent: 'sky',
  },
  {
    icon: Heart,
    title: 'Student-Safe',
    body: 'Built with safety guardrails and appropriate content filtering, vetted against curriculum standards.',
    accent: 'pink',
    wide: true,
  },
];

// Three rows for the bento: wide-left, wide-right, wide-right (matches DOM order).
const FEATURE_ROW_LAYOUTS = ['wide-left', 'wide-right', 'wide-right'];
const FEATURE_ROWS = [
  FEATURES.slice(0, 3),
  FEATURES.slice(3, 6),
  FEATURES.slice(6, 9),
];

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

// Educational motifs that drift sideways behind the hero copy. Each
// row has a fixed vertical position and its own duration / delay so
// the cluster looks like icons quietly travelling across the hero on
// six independent rails. `direction === 'rtl'` flips the keyframe so
// some icons go right-to-left, breaking the procession into a
// crisscross. Sparse on purpose -- six icons total, "just visible".
const HERO_BG_ICONS = [
  { Icon: BookOpen,      top: '14%', size: 50, dur: '32s', delay: '0s',   direction: 'ltr' },
  { Icon: Library,       top: '72%', size: 60, dur: '38s', delay: '6s',   direction: 'rtl' },
  { Icon: GraduationCap, top: '38%', size: 56, dur: '34s', delay: '12s',  direction: 'ltr' },
  { Icon: BookMarked,    top: '85%', size: 40, dur: '36s', delay: '4s',   direction: 'rtl' },
  { Icon: Lightbulb,     top: '24%', size: 38, dur: '30s', delay: '16s',  direction: 'rtl' },
  { Icon: Notebook,      top: '58%', size: 44, dur: '34s', delay: '20s',  direction: 'ltr' },
];

// requestAnimationFrame counter that ticks `from` up to `to` once `active`
// flips true. `easing` shapes the curve: 'linear' keeps the cadence steady
// (used for "850 -> 1000" so each tick covers the same number of students),
// 'easeOut' decelerates near the end (used for "50 -> 95%" so the last
// few percent crawl in like the user wanted). Honours
// prefers-reduced-motion by snapping straight to the final value.
const useAnimatedCounter = (active, from, to, duration, easing = 'linear') => {
  const [value, setValue] = useState(from);
  useEffect(() => {
    if (!active) return undefined;
    const reduce =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setValue(to);
      return undefined;
    }
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = easing === 'easeOut' ? 1 - Math.pow(1 - t, 3) : t;
      setValue(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, from, to, duration, easing]);
  return value;
};

// Hero numbers strip with entrance animations. An IntersectionObserver
// flips `active` once the strip scrolls into view (~35% visible) and
// disconnects so the entrance only plays once per page load. Three
// stats:
//   - 1000+: counts 850 -> 1000 linearly, then "+" fades in.
//   - 95%:   counts 50  -> 95  with ease-out so it slows toward 95.
//   - 24/7:  "24" slides down from above, "7" slides up from below,
//            with the divider fading in last.
const HeroStats = () => {
  const ref = useRef(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setActive(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const students = useAnimatedCounter(active, 900, 1000, 2200, 'linear');
  const accuracy = useAnimatedCounter(active, 60, 95, 2800, 'easeOut');
  const studentsDone = students >= 1000;

  return (
    <div ref={ref} className="hero-stats">
      <div className="stat">
        <span className="stat-number">
          {students}
          <span className={`stat-plus${studentsDone ? ' is-shown' : ''}`}>+</span>
        </span>
        <span className="stat-label">Students Helped</span>
      </div>
      <div className="stat">
        <span className="stat-number">
          {accuracy}
          <span className="stat-percent">%</span>
        </span>
        <span className="stat-label">Citation Accuracy</span>
      </div>
      <div className="stat">
        <span
          className={`stat-number stat-clock${active ? ' is-active' : ''}`}
          aria-label="24 / 7 always available"
        >
          <span className="stat-clock-num stat-clock-num--top" aria-hidden="true">24</span>
          <span className="stat-clock-divider" aria-hidden="true">/</span>
          <span className="stat-clock-num stat-clock-num--bottom" aria-hidden="true">7</span>
        </span>
        <span className="stat-label">Always Available</span>
      </div>
    </div>
  );
};

// Ambient video sitting on the right side of the liquid-glass hero.
// Loops silently as a decorative accent. If the asset hasn't been
// dropped into /public yet (or fails to load for any reason), the
// frame hides itself so the hero falls back to its previous
// single-column layout without leaving a broken-video box.
const HeroCompanionVideo = ({ src = "/hero-companion.mp4" }) => {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <div className="hero-video-frame" aria-hidden="true">
      <video
        className="hero-video"
        src={src}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        onError={() => setFailed(true)}
      />
    </div>
  );
};

const MainPage = () => {
  const navigate = useNavigate();
  const [billing, setBilling] = useState('monthly'); // 'monthly' | 'yearly'
  const [checkoutLoading, setCheckoutLoading] = useState(null); // plan id currently checking out
  const [checkoutError, setCheckoutError] = useState('');

  // Snapshot of the current session user. Lets the navbar and hero
  // CTAs short-circuit the auth flow when somebody is already signed
  // in -- previously every CTA went through /login or /signup, which
  // forced returning users back through the cinematic intro every
  // time they bounced through the home page.
  const sessionUser = getSessionUser();
  const isSignedIn = Boolean(sessionUser?.id);

  const handleHeroPrimary = () => {
    navigate(isSignedIn ? '/chat' : '/signup');
  };

  const handleHeroSecondary = () => {
    navigate(isSignedIn ? '/chat' : '/upload');
  };

  const handleLogout = () => {
    // clearSessionUser drops the bearer token, the cached user, and
    // the token expiry -- exactly what the rest of the app expects
    // when somebody signs out. We don't blanket-clear localStorage
    // because the "tour seen" / "intro video seen" flags should
    // persist per device, not per session.
    try {
      clearSessionUser();
      sessionStorage.removeItem('laboracle_pending_plan');
    } catch {
      /* storage may be unavailable -- silently fall through */
    }
    navigate('/');
    // Force a clean reload so any in-memory React state holding the
    // old user dies with the page. Avoids a stale-avatar flash.
    window.location.reload();
  };

  // Spotlight glow that follows the cursor across hero CTAs. We write the
  // pointer's position relative to the button into CSS custom properties so
  // a `radial-gradient` in the stylesheet can render the highlight at that
  // exact point. Using getBoundingClientRect (instead of layerX/Y) keeps the
  // result stable across browsers and zoom levels.
  const handleSpotlight = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    e.currentTarget.style.setProperty('--mx', `${x}px`);
    e.currentTarget.style.setProperty('--my', `${y}px`);

    // Normalised distance from the button's centre: 0 in the middle,
    // ~1 at any corner. Capped to 1 because corners reach ~sqrt(2)
    // when measured against half-width / half-height. The exponent
    // shapes the curve -- higher values keep the centre dim for
    // longer and only let the glow blaze near the very edges, which
    // matches the "bright-only-at-corners" look in the reference.
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const dx = (x - cx) / cx;
    const dy = (y - cy) / cy;
    const dist = Math.min(1, Math.hypot(dx, dy));
    const intensity = Math.pow(dist, 1.7);
    e.currentTarget.style.setProperty('--edge-intensity', intensity.toFixed(3));
  };

  // Snap the glow off when the cursor leaves the button so it doesn't
  // get stuck at whatever intensity it had at the exit point.
  const handleSpotlightLeave = (e) => {
    e.currentTarget.style.setProperty('--edge-intensity', '0');
  };

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
            {/* Round white disc behind the logo. The .logo-img is
                deliberately a touch larger than the disc so the
                square corners of the artwork peek out beyond the
                circle, matching the request to "round it but have
                the square come out a bit". The bubbles rise from
                the bottom of the disc. */}
            <span className="logo-disc" aria-hidden="true" />
            <img src="/laboracle-logo.png" alt="Laboracle" className="logo-img" />
            <span className="logo-bubbles" aria-hidden="true">
              <span className="logo-bubble" />
              <span className="logo-bubble" />
              <span className="logo-bubble" />
              <span className="logo-bubble" />
              <span className="logo-bubble" />
              <span className="logo-bubble" />
            </span>
          </div>
          <nav className="nav-links">
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#pricing">Pricing</a>
            <a href="#about">About</a>
          </nav>
          <div className="auth-buttons">
            {isSignedIn ? (
              <>
                <button onClick={handleLogout} className="login-btn">
                  Log out
                </button>
                <button
                  onClick={() => navigate('/chat')}
                  className="signup-btn"
                >
                  Open chat
                </button>
              </>
            ) : (
              <>
                <button onClick={() => navigate('/login')} className="login-btn">
                  Login
                </button>
                <button onClick={() => navigate('/signup')} className="signup-btn">
                  Sign Up
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero">
        {/* Drifting educational motifs behind the copy. `aria-hidden`
            because they're decorative -- screen readers should skip
            straight to the headline. */}
        <div className="hero-bg-icons" aria-hidden="true">
          {HERO_BG_ICONS.map(({ Icon, top, size, dur, delay, direction }, i) => (
            <span
              key={i}
              className={`hero-bg-icon hero-bg-icon--${direction}`}
              style={{
                top,
                '--bg-icon-dur': dur,
                '--bg-icon-delay': delay,
              }}
            >
              <Icon size={size} strokeWidth={1.4} />
            </span>
          ))}
        </div>
        <div className="hero-content">
          <h1 className="hero-title">
            Your Smart Learning Assistant
          </h1>
          <p className="hero-subtitle">
            Ask questions about your courses, curriculum, and program details. Get accurate answers 
            with citations powered by safe, low-hallucination AI technology.
          </p>
          <div className="hero-buttons">
            <button
              onClick={handleHeroPrimary}
              onMouseMove={handleSpotlight}
              onMouseLeave={handleSpotlightLeave}
              className="cta-primary cta-spotlight"
            >
              {isSignedIn ? 'Open Chat' : 'Get Started Free'}
            </button>
            <button
              onClick={handleHeroSecondary}
              onMouseMove={handleSpotlight}
              onMouseLeave={handleSpotlightLeave}
              className="cta-secondary cta-spotlight"
            >
              {isSignedIn ? 'Continue Where You Left Off' : 'Try Demo'}
            </button>
          </div>
          <HeroStats />
        </div>

        {/* Ambient companion video pinned to the lower-right corner
            of the hero section, "leaning" against the right edge.
            Sibling of `.hero-content` so it can be absolutely
            positioned against `.hero` itself rather than the centred
            text column. Auto-hides if the asset is missing. */}
        <HeroCompanionVideo />
      </section>

      {/* Features — three rows; each row hovers into an Apple-widget-style
          swap (wide card trades horizontal slots with the pair of small
          cards). Implemented with CSS grid placement only — colours and
          typography unchanged. */}
      <section id="features" className="features">
        <div className="features-head">
          <h2 className="section-title features-title">Powerful Features</h2>
          <p className="features-sub">
            Everything Laboracle does to make safe, citation-backed AI
            actually useful in a classroom.
          </p>
        </div>
        <div className="features-bento-stack">
          {FEATURE_ROWS.map((rowItems, ri) => (
            <div
              key={`bento-row-${ri}`}
              className={`features-bento-row features-bento-row--${FEATURE_ROW_LAYOUTS[ri]}`}
            >
              {rowItems.map(({ icon: Icon, title, body, accent, wide }) => (
                <article
                  key={title}
                  className={[
                    'bento-card',
                    `bento-card--${accent}`,
                    wide ? 'bento-card--wide' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="bento-icon" aria-hidden="true">
                    <Icon size={22} strokeWidth={2.2} />
                  </span>
                  <h3 className="bento-title">{title}</h3>
                  <p className="bento-body">{body}</p>
                </article>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* How It Works Section. Each step card is wrapped in a small SVG that
          paints a dashed rounded-rect stroke around the card's edge; the
          stroke-dashoffset animation makes the dashes appear to march around
          the perimeter, exactly like a conveyor belt. */}
      <section id="how-it-works" className="how-it-works">
        <h2 className="section-title">How It Works</h2>
        <div className="steps">
          <div className="step">
            <StepBelt />
            <div className="step-number">1</div>
            <h3>Ask Your Question</h3>
            <p>Type any question about your course, curriculum, or program administration.</p>
          </div>
          <div className="step-arrow">→</div>
          <div className="step">
            <StepBelt />
            <div className="step-number">2</div>
            <h3>AI Retrieval</h3>
            <p>Our system searches the curriculum database and retrieves relevant information.</p>
          </div>
          <div className="step-arrow">→</div>
          <div className="step">
            <StepBelt />
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
            Laboracle is a safe, intelligent learning assistant designed for
            students at every level — from school through university research.
            Built for entrepreneurship, financial-literacy and academic
            workflows, it helps learners stay on track during online sessions
            and study blocks.
          </p>
          <p>
            Using advanced RAG technology with citation verification and
            low-hallucination safeguards, Laboracle reduces teacher workload
            while ensuring students get accurate, appropriate answers to their
            course questions. Every answer includes source citations for
            transparency and trust.
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
              <a
                href="https://github.com/fk3q"
                target="_blank"
                rel="noopener noreferrer"
                className="social-icon"
                aria-label="Laboracle on GitHub"
              >
                <GithubIcon />
              </a>
              <a
                href="https://www.instagram.com/lab_oracle/"
                target="_blank"
                rel="noopener noreferrer"
                className="social-icon"
                aria-label="Laboracle on Instagram"
              >
                <InstagramIcon />
              </a>
              {/* X (formerly Twitter) — placeholder href until an
                  account exists. Wired to "#" intentionally so the
                  icon stays in the row for visual balance. */}
              <a
                href="#"
                className="social-icon social-icon--placeholder"
                aria-label="X (coming soon)"
                title="Coming soon"
              >
                <XIcon />
              </a>
              <a
                href="https://www.linkedin.com/in/furqan-zedani-1717a5406/"
                target="_blank"
                rel="noopener noreferrer"
                className="social-icon"
                aria-label="Laboracle founder on LinkedIn"
              >
                <LinkedinIcon />
              </a>
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

/**
 * Decorative conveyor-belt animation that marches dashed segments around
 * the edge of a step card.
 *
 * Implementation: an absolutely-positioned SVG fills the parent .step.
 * Inside, a single <rect> is sized via CSS (x/y/width/height/rx as CSS
 * properties — supported by every modern browser since 2020) so it
 * reaches the card's edges with a small inset for the stroke. The stroke
 * uses `stroke-dasharray` to produce belt segments and an animated
 * `stroke-dashoffset` to push them around the rectangle's perimeter,
 * giving the marching tread look. Pure CSS animation, no JS at runtime.
 */
const StepBelt = () => (
  <svg
    className="step-belt"
    aria-hidden="true"
    focusable="false"
    preserveAspectRatio="none"
  >
    <rect className="step-belt-track" rx="14" ry="14" />
  </svg>
);

export default MainPage;
