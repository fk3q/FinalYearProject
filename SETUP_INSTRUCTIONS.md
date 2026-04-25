# Complete Setup Instructions

## Laboracle - Full Stack Setup Guide

This guide will help you set up both the **frontend** (React) and **backend** (FastAPI with RAG).

---

## Prerequisites

### For Frontend
- Node.js 16+ and npm
- Modern web browser

### For Backend
- Python 3.10+
- MongoDB Atlas account (free tier works)
- OpenAI API key

---

## Part 1: MongoDB Atlas Setup (CRITICAL!)

### 1.1 Create MongoDB Atlas Account
1. Go to https://www.mongodb.com/cloud/atlas
2. Sign up for a free account
3. Create a new cluster (free M0 tier is fine)

### 1.2 Get Connection String
1. Click "Connect" on your cluster
2. Choose "Connect your application"
3. Copy the connection string (looks like: `mongodb+srv://username:password@cluster.mongodb.net/`)
4. Replace `<password>` with your actual password

### 1.3 Create Vector Search Index (MOST IMPORTANT!)
1. Go to your cluster → **Search** tab
2. Click **"Create Search Index"**
3. Click **"JSON Editor"**
4. Paste this exact configuration:

```json
{
  "fields": [
    {
      "numDimensions": 1536,
      "path": "embedding",
      "similarity": "cosine",
      "type": "vector"
    },
    {
      "path": "metadata.document_id",
      "type": "filter"
    },
    {
      "path": "metadata.filename",
      "type": "filter"
    }
  ]
}
```

5. Name the index: **`vector_index`**
6. Database: **`course_copilot`**
7. Collection: **`document_chunks`**
8. Click **"Create Search Index"**
9. **Wait 2-5 minutes** for the index to build (status will show "Active")

### 1.4 Whitelist Your IP
1. Go to "Network Access" in Atlas
2. Click "Add IP Address"
3. Choose "Allow Access from Anywhere" (for development)
4. Click "Confirm"

---

## Part 2: Backend Setup

### 2.1 Navigate to Backend Folder
```bash
cd C:\ComputerScienceProject\backend
```

### 2.2 Create Virtual Environment
```bash
python -m venv venv
```

### 2.3 Activate Virtual Environment
```bash
# Windows Command Prompt:
venv\Scripts\activate

# Windows PowerShell:
venv\Scripts\Activate.ps1

# Git Bash:
source venv/Scripts/activate
```

You should see `(venv)` in your terminal.

### 2.4 Install Dependencies
```bash
pip install -r requirements.txt
```

This will take 2-3 minutes.

### 2.5 Create .env File
```bash
copy .env.example .env
```

### 2.6 Edit .env File
Open `.env` in your text editor and add your credentials:

```env
# MongoDB Configuration
MONGODB_URI=mongodb+srv://your-username:your-password@cluster.mongodb.net/
MONGODB_DB_NAME=course_copilot
MONGODB_COLLECTION_NAME=document_chunks
MONGODB_INDEX_NAME=vector_index

# OpenAI Configuration
OPENAI_API_KEY=sk-your-actual-openai-key-here

# Keep all other settings as default
```

**Important:**
- Replace `your-username:your-password` with your actual MongoDB credentials
- Replace `sk-your-actual-openai-key-here` with your OpenAI API key
- Get OpenAI key from: https://platform.openai.com/api-keys

### 2.7 Start Backend Server
```bash
python main.py
```

You should see:
```
INFO:     Started server process
INFO:     Uvicorn running on http://0.0.0.0:8000
```

**Test the API:**
Open browser: http://localhost:8000/docs

You should see the Swagger API documentation.

---

## Part 3: Frontend Setup

### 3.1 Open New Terminal
Keep the backend running and open a NEW terminal window.

### 3.2 Navigate to Project Root
```bash
cd C:\ComputerScienceProject
```

### 3.3 Install Dependencies
```bash
npm install
```

### 3.4 Start Frontend
```bash
npm run dev
```

You should see:
```
  VITE v5.0.8  ready in 500 ms

  ➜  Local:   http://localhost:3000/
```

### 3.5 Open in Browser
Navigate to: http://localhost:3000

---

## Part 4: Testing the Full Stack

### 4.1 Test Document Upload
1. Go to http://localhost:3000
2. Click "Sign Up" (just for navigation, no real auth yet)
3. You'll be redirected to the upload page
4. **Drag and drop a PDF file** or click to browse
5. Wait for upload to complete
6. You should see: "Great! I've processed 1 document and created X searchable chunks"

### 4.2 Test Chat
1. Type a question related to your uploaded document
2. Click "Send" or press Enter
3. Wait for the AI response (should take 3-5 seconds)
4. You should see:
   - Answer from GPT-4o
   - Confidence score (70-95%)
   - Source citations

### 4.3 Test Modes
- **Deterministic Mode**: Factual, precise answers
- **Exploratory Mode**: Creative insights and connections

Switch between modes and ask the same question to see the difference!

---

## Troubleshooting

### Backend Issues

#### "ModuleNotFoundError"
```bash
# Make sure virtual environment is activated
venv\Scripts\activate

# Reinstall dependencies
pip install -r requirements.txt
```

#### "MongoDB connection failed"
- Check `MONGODB_URI` in `.env`
- Verify IP is whitelisted in Atlas
- Check username/password are correct

#### "Vector search index not found"
- **Most common issue!**
- Go to MongoDB Atlas → Search tab
- Verify index named `vector_index` exists and status is "Active"
- Wait 5 minutes after creating the index

#### "OpenAI API error"
- Check `OPENAI_API_KEY` in `.env`
- Verify key is valid at https://platform.openai.com/api-keys
- Check you have API credits

### Frontend Issues

#### "Network error" when uploading
- Make sure backend is running at http://localhost:8000
- Check backend terminal for error messages
- Test backend directly: http://localhost:8000/docs

#### "npm install" fails
```bash
# Clear cache
npm cache clean --force

# Delete node_modules
rmdir /s node_modules

# Reinstall
npm install
```

#### Port 3000 already in use
```bash
# Kill process on port 3000 (PowerShell)
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process

# Or use different port in vite.config.js
```

---

## Common Questions

### Q: Do I need to upload documents every time?
A: No! Documents are stored in MongoDB. They persist between sessions.

### Q: Can I use different embedding models?
A: Yes! Change `EMBEDDING_MODEL` in `.env` but you'll need to recreate the vector index with matching dimensions.

### Q: How much does this cost?
A: 
- MongoDB Atlas: Free tier (512MB storage)
- OpenAI API: ~$0.0001 per query (very cheap)
- Total: A few cents per day for development

### Q: Can I deploy this?
A: Yes! Both frontend and backend can be deployed to:
- Frontend: Vercel, Netlify, GitHub Pages
- Backend: Heroku, Railway, Google Cloud Run
- MongoDB: Already cloud-hosted!

---

## Quick Start Checklist

- [ ] MongoDB Atlas cluster created
- [ ] Vector Search index created (vector_index)
- [ ] IP whitelisted in Atlas
- [ ] Backend .env configured
- [ ] Backend dependencies installed
- [ ] Backend running at http://localhost:8000
- [ ] Frontend dependencies installed  
- [ ] Frontend running at http://localhost:3000
- [ ] Test upload a document
- [ ] Test ask a question
- [ ] See response with citations!

---

## Next Steps

1. **Upload course documents**: PDFs, Word docs, etc.
2. **Test different questions**: Try both student and teacher roles
3. **Experiment with modes**: Compare deterministic vs exploratory
4. **Check citations**: Verify sources are accurate
5. **Monitor confidence**: High confidence = reliable answer

---

## Support

- Backend API docs: http://localhost:8000/docs
- Backend README: `backend/README.md`
- Frontend README: `README.md`

---

**You're all set! Start uploading documents and asking questions!** 🎓🚀
