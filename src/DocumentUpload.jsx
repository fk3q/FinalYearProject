import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './DocumentUpload.css';

// API base — empty string = same-origin relative /api/... paths (proxied by nginx).
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const DocumentUpload = () => {
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState('student'); // 'student' or 'teacher'
  const [aiMode, setAiMode] = useState('deterministic'); // 'deterministic' or 'exploratory'
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [messages, setMessages] = useState([
    { 
      type: 'bot', 
      text: 'Hello! I\'m Laboracle. I can help you with questions about your entrepreneurship program, financial literacy course, and curriculum details. All my answers include source citations!',
      confidence: 100
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    handleFiles(files);
  };

  const handleFiles = async (files) => {
    const validFiles = files.filter(file => {
      const validTypes = ['application/pdf', 'application/msword', 
                         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                         'text/plain', 'text/csv'];
      return validTypes.includes(file.type) || file.name.match(/\.(pdf|doc|docx|txt|csv)$/i);
    });

    if (validFiles.length === 0) return;

    const newFiles = validFiles.map(file => ({
      id: Date.now() + Math.random(),
      name: file.name,
      size: (file.size / 1024).toFixed(2) + ' KB',
      status: 'uploading',
      file: file
    }));

    setUploadedFiles(prev => [...prev, ...newFiles]);

    // Upload each file to backend
    for (let i = 0; i < newFiles.length; i++) {
      const fileObj = newFiles[i];
      
      try {
        // Create FormData
        const formData = new FormData();
        formData.append('file', fileObj.file);

        // Upload to backend
        const response = await fetch(`${API_BASE_URL}/api/documents/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.statusText}`);
        }

        const result = await response.json();
        
        // Mark as completed
        setUploadedFiles(prev => 
          prev.map(f => f.id === fileObj.id ? { 
            ...f, 
            status: 'completed',
            document_id: result.document_id,
            chunks: result.total_chunks
          } : f)
        );

        // Add bot message after last upload
        if (i === newFiles.length - 1) {
          setMessages(prev => [...prev, {
            type: 'bot',
            text: `Great! I've processed ${newFiles.length} document${newFiles.length > 1 ? 's' : ''} and created ${result.total_chunks} searchable chunks. You can now ask me questions about your documents.`,
            confidence: 90
          }]);
        }
      } catch (error) {
        console.error('Upload error:', error);
        setUploadedFiles(prev => 
          prev.map(f => f.id === fileObj.id ? { ...f, status: 'error' } : f)
        );
        
        setMessages(prev => [...prev, {
          type: 'bot',
          text: `Sorry, there was an error uploading ${fileObj.name}. Please make sure the backend server is running.`,
          confidence: 0
        }]);
      }
    }
  };

  const removeFile = (id) => {
    setUploadedFiles(prev => prev.filter(file => file.id !== id));
  };

  const handleSendMessage = async () => {
    if (inputMessage.trim() === '') return;

    const userMessage = { type: 'user', text: inputMessage };
    setMessages(prev => [...prev, userMessage]);
    const query = inputMessage;
    setInputMessage('');
    setIsTyping(true);

    try {
      // Send query to backend
      const response = await fetch(`${API_BASE_URL}/api/chat/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query,
          mode: aiMode,
          user_role: userRole
        }),
      });

      if (!response.ok) {
        throw new Error(`Query failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Add bot response
      const botResponse = {
        type: 'bot',
        text: result.answer,
        confidence: result.confidence,
        citations: result.citations || []
      };
      
      setMessages(prev => [...prev, botResponse]);
    } catch (error) {
      console.error('Query error:', error);
      
      // Fallback response on error
      const errorResponse = {
        type: 'bot',
        text: uploadedFiles.length === 0 
          ? 'Please upload some documents first so I can help you find answers. You can also ask general questions about the course structure.'
          : 'I apologize, but I encountered an error processing your question. Please make sure the backend server is running at http://localhost:8000',
        confidence: 50,
        citations: []
      };
      
      setMessages(prev => [...prev, errorResponse]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="document-upload-page">
      {/* Top Navigation */}
      <div className="top-nav">
        <div className="nav-left">
          <span className="logo-text">Laboracle</span>
          <span className="company-badge">by Flosendo</span>
        </div>
        <div className="nav-right">
          <div className="role-switch">
            <button 
              className={`role-btn ${userRole === 'student' ? 'active' : ''}`}
              onClick={() => setUserRole('student')}
            >
              Student
            </button>
            <button 
              className={`role-btn ${userRole === 'teacher' ? 'active' : ''}`}
              onClick={() => setUserRole('teacher')}
            >
              Teacher
            </button>
          </div>
          <button onClick={() => navigate('/')} className="nav-button">
            Home
          </button>
          <button className="nav-button user-profile">
            <span className="user-avatar">Profile</span>
          </button>
        </div>
      </div>

      <div className="upload-container">
        {/* Left Panel - Document Upload */}
        <div className="upload-panel">
          <div className="panel-header">
            <h2>Course Materials</h2>
            <p>Upload additional curriculum materials (optional)</p>
          </div>

          <div
            className={`drop-zone ${isDragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="drop-zone-content">
              <div className="upload-icon">↑</div>
              <h3>Upload Course Materials</h3>
              <p>Add extra curriculum documents (optional)</p>
              <span className="file-types">Supported: PDF, DOC, DOCX, TXT, CSV</span>
              <span className="file-note">Base curriculum already loaded</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.txt,.csv"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>

          <div className="uploaded-files">
            <h3>Uploaded Files ({uploadedFiles.length})</h3>
            {uploadedFiles.length === 0 ? (
              <div className="no-files">
                <p>No documents uploaded yet</p>
              </div>
            ) : (
              <div className="files-list">
                {uploadedFiles.map(file => (
                  <div key={file.id} className="file-item">
                    <div className="file-icon">
                      {file.name.endsWith('.pdf') ? 'PDF' :
                       file.name.endsWith('.doc') || file.name.endsWith('.docx') ? 'DOC' :
                       'FILE'}
                    </div>
                    <div className="file-details">
                      <span className="file-name">{file.name}</span>
                      <span className="file-size">{file.size}</span>
                    </div>
                    <div className="file-actions">
                      {file.status === 'uploading' && (
                        <span className="status uploading">Uploading...</span>
                      )}
                      {file.status === 'completed' && (
                        <>
                          <span className="status completed">✓</span>
                          <button
                            className="remove-btn"
                            onClick={() => removeFile(file.id)}
                          >
                            ×
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="upload-stats">
            <div className="stat-item">
              <span className="stat-label">Total Documents</span>
              <span className="stat-value">{uploadedFiles.length}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Ready to Chat</span>
              <span className="stat-value">
                {uploadedFiles.filter(f => f.status === 'completed').length}
              </span>
            </div>
          </div>
        </div>

        {/* Right Panel - Chatbot */}
        <div className="chat-panel">
          <div className="chat-header">
            <div className="chat-header-content">
              <div className="bot-avatar">AI</div>
              <div className="header-text">
                <h2>Laboracle</h2>
                <p className="chat-status">
                  {uploadedFiles.length === 0 
                    ? 'Ready with curriculum database' 
                    : `Enhanced with ${uploadedFiles.length} additional document${uploadedFiles.length > 1 ? 's' : ''}`}
                </p>
              </div>
              <div className="mode-switch">
                <label className="switch-label">Mode:</label>
                <button 
                  className={`mode-btn ${aiMode === 'deterministic' ? 'active' : ''}`}
                  onClick={() => setAiMode('deterministic')}
                  title="Factual answers only from verified sources"
                >
                  Deterministic
                </button>
                <button 
                  className={`mode-btn ${aiMode === 'exploratory' ? 'active' : ''}`}
                  onClick={() => setAiMode('exploratory')}
                  title="Explore connections and creative insights"
                >
                  Exploratory
                </button>
              </div>
            </div>
          </div>

          <div className="chat-messages">
            {messages.map((message, index) => (
              <div key={index} className={`message ${message.type}`}>
                {message.type === 'bot' && (
                  <div className="message-avatar">AI</div>
                )}
                <div className="message-content">
                  <p>{message.text}</p>
                  {message.type === 'bot' && message.confidence && (
                    <div className="message-meta">
                      <div className="confidence-badge">
                        <span className="confidence-label">Confidence:</span>
                        <span className={`confidence-value ${
                          message.confidence >= 90 ? 'high' : 
                          message.confidence >= 75 ? 'medium' : 'low'
                        }`}>
                          {message.confidence}%
                        </span>
                      </div>
                      {message.citations && message.citations.length > 0 && (
                        <div className="citations">
                          <span className="citations-label">Sources:</span>
                          {message.citations.map((citation, idx) => (
                            <span key={idx} className="citation-item">{citation}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {message.type === 'user' && (
                  <div className="message-avatar user-avatar">
                    {userRole === 'teacher' ? 'T' : 'S'}
                  </div>
                )}
              </div>
            ))}
            {isTyping && (
              <div className="message bot">
                <div className="message-avatar">AI</div>
                <div className="message-content typing">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span className="typing-text">Searching curriculum database...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="chat-input-container">
            <div className="suggested-questions">
              <button 
                className="suggestion"
                onClick={() => setInputMessage('What is the entrepreneurship accelerator program about?')}
              >
                Program Overview
              </button>
              <button 
                className="suggestion"
                onClick={() => setInputMessage('How do the online missions work?')}
              >
                Mission Structure
              </button>
              <button 
                className="suggestion"
                onClick={() => setInputMessage('What topics are covered in financial literacy?')}
              >
                Course Topics
              </button>
              <button 
                className="suggestion"
                onClick={() => setInputMessage('When are the classroom blocks scheduled?')}
              >
                Schedule Info
              </button>
            </div>
            <div className="chat-input">
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={userRole === 'teacher' 
                  ? "Ask about curriculum, program structure, or admin details..."
                  : "Ask about your course, lessons, or assignments..."}
                rows="1"
              />
              <button 
                className="send-button"
                onClick={handleSendMessage}
                disabled={inputMessage.trim() === ''}
              >
                <span>Send</span>
                <span className="send-icon">→</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentUpload;
