# Laboracle - Setup Guide

Complete guide to set up and run the Laboracle application.

## 📋 Table of Contents
1. [Quick Start](#quick-start)
2. [Detailed Setup](#detailed-setup)
3. [Project Structure](#project-structure)
4. [Running the Application](#running-the-application)
5. [Backend Integration](#backend-integration)
6. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Windows Command Prompt

```bash
# Navigate to project folder
cd C:\ComputerScienceProject

# Install dependencies
npm install

# Start development server
npm run dev
```

Open browser to: `http://localhost:3000`

---

## Detailed Setup

### Prerequisites

**Required:**
- Node.js 16.x or higher ([Download](https://nodejs.org/))
- npm (comes with Node.js)
- Modern web browser (Chrome, Firefox, Edge)

**Optional (for backend development):**
- Python 3.10+
- Docker Desktop
- PostgreSQL 15+

### Verify Prerequisites

```bash
# Check Node.js version
node --version
# Should show: v16.x.x or higher

# Check npm version
npm --version
# Should show: 8.x.x or higher
```

---

## Project Structure

```
C:\ComputerScienceProject\
│
├── 📄 Frontend Files (React)
│   ├── App.jsx                 # Main app with routing
│   ├── MainPage.jsx           # Landing page
│   ├── Login.jsx              # Login page
│   ├── Signup.jsx             # Signup page
│   ├── DocumentUpload.jsx     # Q&A interface
│   │
│   ├── Auth.css               # Auth pages styles
│   ├── MainPage.css           # Landing page styles
│   ├── DocumentUpload.css     # Q&A interface styles
│   ├── index.css              # Global styles
│   │
│   ├── main.jsx               # React entry point
│   ├── index.html             # HTML template
│   │
├── ⚙️ Configuration
│   ├── vite.config.js         # Vite config
│   ├── package.json           # Dependencies
│   ├── .gitignore             # Git ignore rules
│   │
└── 📚 Documentation
    ├── README.md              # Project overview
    ├── SETUP_GUIDE.md         # This file
    └── TECHNICAL_SPECS.md     # Technical details
```

---

## Running the Application

### Step 1: Install Dependencies

First time setup only:

```bash
cd C:\ComputerScienceProject
npm install
```

This downloads all required packages (~200MB). Takes 2-5 minutes depending on internet speed.

### Step 2: Start Development Server

```bash
npm run dev
```

You should see:
```
  VITE v5.0.8  ready in 500 ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
```

### Step 3: Open in Browser

Navigate to: `http://localhost:3000`

### Step 4: Test the Application

1. **Main Page**: View features and information
2. **Click "Sign Up"**: Test registration form
3. **Fill form**: Enter test data
4. **Submit**: Redirects to Q&A interface
5. **Ask questions**: Test the chatbot

---

## Available Commands

```bash
# Development server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint
```

---

## Backend Integration

### Future Integration Steps

When integrating the FastAPI backend:

#### 1. Backend Setup

```bash
# Create backend directory
mkdir backend
cd backend

# Create Python virtual environment
python -m venv venv

# Activate environment
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Install Python dependencies
pip install fastapi uvicorn langchain openai faiss-cpu python-dotenv pydantic sqlalchemy
```

#### 2. Environment Variables

Create `.env` file in backend directory:

```env
# API Keys
OPENAI_API_KEY=your_openai_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/copilot

# JWT
JWT_SECRET=your-secret-key-here
JWT_ALGORITHM=HS256

# Application
ENVIRONMENT=development
LOG_LEVEL=INFO
```

#### 3. API Connection

Update frontend to connect to backend:

**Create `src/api/config.js`:**
```javascript
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const apiClient = {
  async post(endpoint, data) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(data)
    });
    return response.json();
  },
  
  async get(endpoint) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    return response.json();
  }
};
```

**Update `DocumentUpload.jsx` to use real API:**
```javascript
import { apiClient } from './api/config';

const handleSendMessage = async () => {
  if (inputMessage.trim() === '') return;

  const userMessage = { type: 'user', text: inputMessage };
  setMessages(prev => [...prev, userMessage]);
  setInputMessage('');
  setIsTyping(true);

  try {
    const response = await apiClient.post('/api/chat/query', {
      query: inputMessage,
      mode: aiMode,
      user_role: userRole
    });

    const botResponse = {
      type: 'bot',
      text: response.answer,
      confidence: response.confidence,
      citations: response.citations
    };
    
    setMessages(prev => [...prev, botResponse]);
  } catch (error) {
    console.error('Error:', error);
    setMessages(prev => [...prev, {
      type: 'bot',
      text: 'Sorry, I encountered an error. Please try again.',
      confidence: 0
    }]);
  } finally {
    setIsTyping(false);
  }
};
```

#### 4. Run Full Stack

Terminal 1 (Backend):
```bash
cd backend
uvicorn main:app --reload --port 8000
```

Terminal 2 (Frontend):
```bash
cd C:\ComputerScienceProject
npm run dev
```

---

## Features Guide

### 1. Role Switching
- **Student Mode**: Simplified interface for K12 students
- **Teacher Mode**: Access to curriculum and admin features
- Toggle in top navigation bar

### 2. AI Modes
- **Deterministic**: Factual answers only (recommended for homework)
- **Exploratory**: Creative connections and insights
- Toggle in chat header

### 3. Confidence Scores
- **Green (90-100%)**: High confidence, verified answer
- **Yellow (75-89%)**: Medium confidence, mostly verified
- **Red (<75%)**: Low confidence, use with caution

### 4. Citations
- Every answer includes source references
- Click citations to see source documents (when backend is integrated)
- Verify information independently

### 5. Suggested Questions
- Quick start buttons for common queries
- Customizable per course/topic
- Updates based on recent queries

---

## Troubleshooting

### Problem: `npm install` fails

**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock.json
rmdir /s node_modules
del package-lock.json

# Reinstall
npm install
```

### Problem: Port 3000 already in use

**Solution:**
```bash
# Option 1: Kill process on port 3000
# Windows PowerShell:
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process

# Option 2: Use different port
# Edit vite.config.js, change port to 3001
```

### Problem: Page doesn't update after code changes

**Solution:**
1. Stop the dev server (Ctrl + C)
2. Clear browser cache
3. Restart dev server: `npm run dev`
4. Hard refresh browser (Ctrl + F5)

### Problem: Styles not loading correctly

**Solution:**
```bash
# Rebuild from scratch
npm run build
npm run preview

# Or clear Vite cache
rmdir /s node_modules\.vite
npm run dev
```

### Problem: React Router shows 404

**Solution:**
- Make sure you're using `npm run dev`, not opening `index.html` directly
- Browser must access via `http://localhost:3000`, not `file://`

---

## Development Tips

### Hot Module Replacement (HMR)
- Changes to `.jsx` and `.css` files automatically reload
- No need to refresh browser manually
- If HMR stops working, restart dev server

### Browser DevTools
- **F12**: Open developer tools
- **Console**: Check for JavaScript errors
- **Network**: Monitor API requests
- **React DevTools**: Install extension for component inspection

### Code Organization
```javascript
// Component structure
import React, { useState, useEffect } from 'react';
import './Component.css';

const Component = () => {
  // 1. State declarations
  const [state, setState] = useState(initialValue);
  
  // 2. Effects
  useEffect(() => {
    // Effect logic
  }, [dependencies]);
  
  // 3. Event handlers
  const handleEvent = () => {
    // Handler logic
  };
  
  // 4. Render
  return (
    <div>
      {/* JSX */}
    </div>
  );
};

export default Component;
```

---

## Next Steps

### Phase 1: Frontend Polish (Current)
- ✅ Basic UI implementation
- ✅ Routing and navigation
- ✅ Mock data and responses
- ⏳ User feedback and improvements

### Phase 2: Backend Development
- [ ] Set up FastAPI backend
- [ ] Implement RAG pipeline
- [ ] Vector store integration
- [ ] LLM API integration

### Phase 3: Full Integration
- [ ] Connect frontend to backend
- [ ] User authentication
- [ ] Real-time chat
- [ ] Document processing

### Phase 4: Safety & Testing
- [ ] Hallucination detection
- [ ] Confidence calibration
- [ ] Unit and integration tests
- [ ] User acceptance testing

### Phase 5: Deployment
- [ ] Docker containerization
- [ ] Cloud deployment
- [ ] CI/CD pipeline
- [ ] Monitoring and logging

---

## Support Resources

### Documentation
- React: https://react.dev/
- Vite: https://vitejs.dev/
- React Router: https://reactrouter.com/

### Flosendo Project
- Project README: `README.md`
- Technical Specs: `TECHNICAL_SPECS.md`
- This Guide: `SETUP_GUIDE.md`

### Getting Help
1. Check this guide first
2. Review error messages in console
3. Search error on Stack Overflow
4. Check project documentation

---

## Keyboard Shortcuts

### Development
- `Ctrl + C`: Stop development server
- `Ctrl + Shift + R`: Hard refresh browser
- `F12`: Open DevTools
- `Ctrl + K`: Clear console

### VS Code (Recommended Editor)
- `Ctrl + P`: Quick file open
- `Ctrl + Shift + F`: Search in project
- `Ctrl + /`: Toggle comment
- `Alt + Up/Down`: Move line

---

**Last Updated**: 2026-02-04  
**Version**: 1.0  
**Status**: Production Ready (Frontend)

For questions or issues, refer to the main README.md or project documentation.
