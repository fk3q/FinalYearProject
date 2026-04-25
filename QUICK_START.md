# Quick Start Guide - Laboracle

## 🚀 Get Started in 5 Minutes!

### Step 1: MongoDB Atlas Setup (2 minutes)

1. **Create account**: https://www.mongodb.com/cloud/atlas
2. **Create cluster** (free tier)
3. **Get connection string**: Click "Connect" → Copy the URI
4. **Create Vector Search Index**:
   - Go to Search tab
   - Create new index
   - Use JSON Editor, paste:
   ```json
   {
     "fields": [
       {
         "numDimensions": 1536,
         "path": "embedding",
         "similarity": "cosine",
         "type": "vector"
       }
     ]
   }
   ```
   - Name: `vector_index`
   - Database: `course_copilot`
   - Collection: `document_chunks`

5. **Whitelist IP**: Network Access → Add IP → Allow from anywhere

### Step 2: Backend Setup (2 minutes)

```bash
cd C:\ComputerScienceProject\backend

# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Install packages
pip install -r requirements.txt

# Create .env
copy .env.example .env
```

**Edit .env file:**
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
OPENAI_API_KEY=sk-your-key-here
```

**Start server:**
```bash
python main.py
```

Visit: http://localhost:8000/docs

### Step 3: Frontend Setup (1 minute)

**Open NEW terminal:**
```bash
cd C:\ComputerScienceProject

npm install

npm run dev
```

Visit: http://localhost:3000

### Step 4: Test It! (1 minute)

1. Go to http://localhost:3000
2. Click "Sign Up" → Upload page
3. Upload a PDF file
4. Ask: "What is this document about?"
5. See AI response with citations!

---

## 📋 Checklist

- [ ] MongoDB Atlas cluster created
- [ ] Vector index created (wait 5 min for "Active" status)
- [ ] Backend .env configured
- [ ] Backend running: http://localhost:8000
- [ ] Frontend running: http://localhost:3000
- [ ] Tested upload + chat

---

## 🆘 Having Issues?

### Backend won't start
```bash
# Activate venv first!
venv\Scripts\activate

# Then run
python main.py
```

### "Vector search index not found"
- Wait 5 minutes after creating index
- Check index name is exactly: `vector_index`
- Verify status is "Active" in Atlas

### Upload fails
- Make sure backend is running
- Check http://localhost:8000/docs works
- Look at backend terminal for errors

### Chat doesn't respond
- Verify you uploaded documents first
- Check browser console (F12) for errors
- Check backend terminal for errors

---

## 🎯 What You Built

- **Frontend**: React app with file upload & chat interface
- **Backend**: FastAPI with RAG pipeline
- **Database**: MongoDB Atlas with vector search
- **AI**: OpenAI embeddings (text-embedding-3-small) + GPT-4o

**Architecture:**
```
User uploads PDF → FastAPI → LangChain chunks it → 
OpenAI embeddings → MongoDB Atlas → User asks question → 
Vector search retrieves chunks → GPT-4o generates answer → 
Returns with citations
```

---

## 📚 Next Steps

1. Upload your course materials
2. Test with real questions
3. Try different AI modes (Deterministic vs Exploratory)
4. Switch roles (Student vs Teacher)
5. Check citations and confidence scores

---

**Full docs**: See `SETUP_INSTRUCTIONS.md` for detailed guide

**You're ready to go!** 🚀
