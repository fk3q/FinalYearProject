import React from 'react';
import { useNavigate } from 'react-router-dom';
import './MainPage.css';

const MainPage = () => {
  const navigate = useNavigate();

  return (

    
    <div className="main-page">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <span className="logo-text">Course Co-Pilot</span>
          </div>
          <nav className="nav-links">
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
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


      

      {/* About Section */}
      <section id="about" className="about">
        <div className="about-content">
          <h2 className="section-title">About Course Co-Pilot</h2>
          <p>
            Course Co-Pilot is Flosendo Limited's safe, intelligent learning assistant designed specifically 
            for K12 students (ages 9-17). Built for our entrepreneurship accelerator and gamified financial 
            literacy courses, it helps students stay on track during online missions and classroom blocks.
          </p>
          <p>
            Using advanced RAG technology with citation verification and low-hallucination safeguards, 
            Course Co-Pilot reduces teacher workload while ensuring students get accurate, age-appropriate 
            answers to their course questions. Every answer includes source citations for transparency and trust.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-content">
          <div className="footer-section">
            <h3>Course Co-Pilot</h3>
            <p>Your smart learning companion</p>
            <p style={{ marginTop: '10px', fontSize: '13px' }}>by Flosendo Limited</p>
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
            <a href="#">Pricing</a>
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
          <p>&copy; 2026 Flosendo Limited. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default MainPage;
