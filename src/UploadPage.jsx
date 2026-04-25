import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AccountSidebarBlock from './components/AccountSidebarBlock';
import { useUsageTracker } from './hooks/useUsageTracker';
import { getSessionUser } from './api/auth';
import './UploadPage.css';

// Empty string => same-origin relative paths (/api/...). nginx in the frontend
// container proxies those to the backend. Keeps the app host-agnostic so it
// works from localhost, AWS, or a real domain without a rebuild.
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const UploadPage = () => {
  useUsageTracker();
  const navigate = useNavigate();
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const fileInputRef = useRef(null);
  const currentUser = getSessionUser();

  const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt'];

  const isValidFile = (file) =>
    ALLOWED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(Array.from(e.dataTransfer.files));
  };
  const handleFileSelect = (e) => processFiles(Array.from(e.target.files));

  const processFiles = (files) => {
    setGlobalError('');
    if (!currentUser?.id) {
      setGlobalError('Please sign in before uploading documents — your files are private to your account.');
      return;
    }
    const invalid = files.filter((f) => !isValidFile(f));
    if (invalid.length) {
      setGlobalError(`Unsupported file type(s): ${invalid.map((f) => f.name).join(', ')}. Only PDF, DOCX, TXT allowed.`);
    }
    const valid = files.filter(isValidFile);
    if (!valid.length) return;

    const entries = valid.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      name: file.name,
      size: (file.size / 1024).toFixed(1) + ' KB',
      type: file.name.split('.').pop().toUpperCase(),
      status: 'pending',   // pending | uploading | success | error
      message: '',
      chunks: null,
    }));

    setUploadedFiles((prev) => [...prev, ...entries]);
    entries.forEach((entry) => uploadFile(entry));
  };

  const uploadFile = async (entry) => {
    setUploadedFiles((prev) =>
      prev.map((f) => f.id === entry.id ? { ...f, status: 'uploading' } : f)
    );

    try {
      if (!currentUser?.id) {
        throw new Error('Please sign in to upload documents.');
      }
      const formData = new FormData();
      formData.append('file', entry.file);
      formData.append('user_id', String(currentUser.id));

      const res = await fetch(`${API_BASE_URL}/api/documents/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || 'Upload failed');
      }

      const data = await res.json();

      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.id === entry.id
            ? { ...f, status: 'success', chunks: data.total_chunks, message: `${data.total_chunks} chunks stored` }
            : f
        )
      );
    } catch (err) {
      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.id === entry.id ? { ...f, status: 'error', message: err.message } : f
        )
      );
    }
  };

  const removeFile = (id) =>
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));

  const successCount = uploadedFiles.filter((f) => f.status === 'success').length;

  return (
    <div className="up-page">
      {/* ── Sidebar ── */}
      <aside className="up-sidebar">
        <div className="up-brand" onClick={() => navigate('/')}>
          <span className="up-brand-icon">C</span>
          <span className="up-brand-name">Laboracle</span>
        </div>

        <nav className="up-nav">
          <button className="up-nav-item active">
            <span className="up-nav-icon">↑</span> Upload Documents
          </button>
          <button className="up-nav-item" onClick={() => navigate('/chat')}>
            <span className="up-nav-icon">&#9679;</span> Chat with AI
          </button>
          <button className="up-nav-item" onClick={() => navigate('/profile')}>
            <span className="up-nav-icon">&#9675;</span> My profile
          </button>
        </nav>

        <AccountSidebarBlock variant="up" />

        <div className="up-sidebar-stats">
          <div className="up-stat">
            <span className="up-stat-num">{uploadedFiles.length}</span>
            <span className="up-stat-lbl">Uploaded</span>
          </div>
          <div className="up-stat">
            <span className="up-stat-num">{successCount}</span>
            <span className="up-stat-lbl">Indexed</span>
          </div>
        </div>

        <button className="up-chat-cta" onClick={() => navigate('/chat')}>
          Go to Chat &rarr;
        </button>
      </aside>

      {/* ── Main ── */}
      <main className="up-main">
        <header className="up-header">
          <h1 className="up-title">Document Upload</h1>
          <p className="up-subtitle">
            Upload your course materials. They will be chunked, embedded, and
            indexed so the AI can answer questions about them.
          </p>
        </header>

        {/* Privacy / ownership banner */}
        {currentUser?.id ? (
          <div className="up-alert" style={{ background: '#1f2a44', color: '#cfe1ff', border: '1px solid #2c3b66' }}>
            Uploading as <strong>{currentUser.first_name || currentUser.email}</strong>. Your documents stay private to your account &mdash; other users cannot see, search or download them.
          </div>
        ) : (
          <div className="up-alert up-alert--error">
            You must <a href="/login" style={{ color: '#fff', textDecoration: 'underline' }}>sign in</a> to upload documents. Each user's files are isolated and only the owner can query them.
          </div>
        )}

        {/* Drop zone */}
        <div
          className={`up-dropzone ${isDragging ? 'up-dropzone--drag' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => currentUser?.id && fileInputRef.current?.click()}
          style={!currentUser?.id ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
        >
          <div className="up-dropzone-icon">&#8679;</div>
          <p className="up-dropzone-title">Drag &amp; drop files here</p>
          <p className="up-dropzone-sub">or click to browse</p>
          <div className="up-badge-row">
            {ALLOWED_EXTENSIONS.map((ext) => (
              <span key={ext} className="up-ext-badge">
                {ext.replace('.', '').toUpperCase()}
              </span>
            ))}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>

        {/* Global error */}
        {globalError && (
          <div className="up-alert up-alert--error">{globalError}</div>
        )}

        {/* File list */}
        {uploadedFiles.length > 0 && (
          <section className="up-file-section">
            <h2 className="up-section-title">Files</h2>
            <ul className="up-file-list">
              {uploadedFiles.map((f) => (
                <li key={f.id} className={`up-file-item up-file-item--${f.status}`}>
                  <div className="up-file-type-badge">{f.type}</div>

                  <div className="up-file-info">
                    <span className="up-file-name">{f.name}</span>
                    <span className="up-file-meta">{f.size}</span>
                  </div>

                  <div className="up-file-status">
                    {f.status === 'uploading' && (
                      <span className="up-status up-status--loading">
                        <span className="up-spinner" /> Processing…
                      </span>
                    )}
                    {f.status === 'success' && (
                      <span className="up-status up-status--success">
                        &#10003; {f.message}
                      </span>
                    )}
                    {f.status === 'error' && (
                      <span className="up-status up-status--error">
                        &#10005; {f.message}
                      </span>
                    )}
                    {f.status === 'pending' && (
                      <span className="up-status up-status--pending">Queued</span>
                    )}
                  </div>

                  <button
                    className="up-remove-btn"
                    onClick={() => removeFile(f.id)}
                    title="Remove"
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Proceed banner */}
        {successCount > 0 && (
          <div className="up-proceed-banner">
            <p>
              <strong>{successCount}</strong> document{successCount > 1 ? 's' : ''} indexed
              successfully. Ready to chat!
            </p>
            <button className="up-proceed-btn" onClick={() => navigate('/chat')}>
              Open Chat &rarr;
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default UploadPage;
