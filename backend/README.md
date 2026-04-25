# Laboracle Backend API

FastAPI backend with RAG (Retrieval-Augmented Generation) using LangChain, MongoDB Atlas, and OpenAI.

## Features

- **Document Upload**: Upload PDF, DOC, DOCX, TXT, CSV files
- **Automatic Chunking**: Uses RecursiveCharacterTextSplitter
- **Vector Embeddings**: text-embedding-3-small model
- **MongoDB Atlas Storage**: Vector search with Atlas Search
- **RAG Chat**: GPT-4o powered responses with citations
- **Confidence Scoring**: Transparency in AI certainty
- **Dual Modes**: Deterministic (factual) and Exploratory (creative)

## Prerequisites

- Python 3.10+
- MongoDB Atlas account with Vector Search enabled
- OpenAI API key

## MongoDB Atlas Setup

### 1. Create Atlas Search Index

In MongoDB Atlas:
1. Go to your cluster → **Search** tab
2. Click **"Create Search Index"**
3. Select **JSON Editor**
4. Use this configuration:

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

5. Name it **`vector_index`** (or customize in .env)
6. Click **"Create Search Index"**

## Installation

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## Configuration

1. Copy `.env.example` to `.env`:
```bash
copy .env.example .env
```

2. Edit `.env` with your credentials:
```env
# MongoDB Configuration
MONGODB_URI=mongodb+srv://your-username:your-password@cluster.mongodb.net/
MONGODB_DB_NAME=course_copilot
MONGODB_COLLECTION_NAME=document_chunks
MONGODB_INDEX_NAME=vector_index

# OpenAI Configuration
OPENAI_API_KEY=sk-your-actual-openai-key-here
```

## Running the Server

### Development Mode
```bash
python main.py
```

Or with uvicorn:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Server will run at: **http://localhost:8000**

### Test the API
Visit: **http://localhost:8000/docs** for Swagger UI

## API Endpoints

### 1. Health Check
```bash
GET /
GET /health
```

### 2. Upload Document
```bash
POST /api/documents/upload
Content-Type: multipart/form-data

# Example with cURL:
curl -X POST http://localhost:8000/api/documents/upload \
  -F "file=@C:\path\to\document.pdf"
```

**Response:**
```json
{
  "document_id": "123e4567-e89b-12d3-a456-426614174000",
  "filename": "curriculum.pdf",
  "total_chunks": 4,
  "status": "success",
  "message": "Document processed successfully. Created 4 chunks."
}
```

### 3. Chat Query
```bash
POST /api/chat/query
Content-Type: application/json

# Example:
curl -X POST http://localhost:8000/api/chat/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is the entrepreneurship program about?",
    "mode": "deterministic",
    "user_role": "student"
  }'
```

**Response:**
```json
{
  "answer": "According to the curriculum...",
  "confidence": 92,
  "citations": [
    "curriculum.pdf, Section 1",
    "guide.pdf, Section 3"
  ],
  "mode": "deterministic",
  "retrieved_chunks": 5
}
```

### 4. Get Document Count
```bash
GET /api/documents/count
```

### 5. Delete Document
```bash
DELETE /api/documents/{document_id}
```

## How It Works

### Document Upload Flow
1. Frontend sends file to `/api/documents/upload`
2. Backend saves file temporarily
3. LangChain loader parses document (PDF, DOCX, etc.)
4. `RecursiveCharacterTextSplitter` splits into chunks:
   - **Chunk size**: 1000 characters
   - **Overlap**: 200 characters
5. OpenAI `text-embedding-3-small` generates embeddings
6. Chunks + embeddings stored in MongoDB Atlas

### Chat Query Flow
1. Frontend sends query to `/api/chat/query`
2. Query embedded with `text-embedding-3-small`
3. MongoDB Atlas Vector Search retrieves top 5 similar chunks
4. Context built from retrieved chunks
5. Prompt template selected (deterministic/exploratory, student/teacher)
6. GPT-4o generates response based on context
7. Citations extracted from chunk metadata
8. Confidence score calculated
9. Structured response returned to frontend

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | Required |
| `MONGODB_DB_NAME` | Database name | course_copilot |
| `MONGODB_COLLECTION_NAME` | Collection name | document_chunks |
| `MONGODB_INDEX_NAME` | Vector search index | vector_index |
| `OPENAI_API_KEY` | OpenAI API key | Required |
| `EMBEDDING_MODEL` | Embedding model | text-embedding-3-small |
| `LLM_MODEL` | LLM model | gpt-4o |
| `CHUNK_SIZE` | Chunk size | 1000 |
| `CHUNK_OVERLAP` | Chunk overlap | 200 |
| `TOP_K` | Chunks to retrieve | 5 |

## Project Structure

```
backend/
├── main.py                    # FastAPI app
├── requirements.txt           # Dependencies
├── .env                      # Your config
├── .env.example             # Example config
│
└── app/
    ├── config.py             # Settings
    ├── models/
    │   └── schemas.py        # Pydantic models
    └── services/
        ├── document_service.py  # Upload & chunking
        └── chat_service.py      # RAG & chat
```

## Troubleshooting

### MongoDB Connection Error
✅ Check `MONGODB_URI` format  
✅ Whitelist your IP in Atlas  
✅ Verify cluster is running  

### Vector Search Not Working
✅ Create Atlas Search index (see setup above)  
✅ Index name matches `MONGODB_INDEX_NAME`  
✅ Wait 2-5 minutes for index to build  

### OpenAI API Error
✅ Verify `OPENAI_API_KEY` is valid  
✅ Check API usage limits  
✅ Ensure models are accessible (gpt-4o, text-embedding-3-small)  

### Import Errors
✅ Activate virtual environment  
✅ Reinstall: `pip install -r requirements.txt`  

## Next Steps

1. **Install packages**: `pip install -r requirements.txt`
2. **Configure .env**: Add your MongoDB URI and OpenAI key
3. **Create Atlas Search index** (critical!)
4. **Run server**: `python main.py`
5. **Test**: Visit http://localhost:8000/docs
6. **Connect frontend**: Update `API_BASE_URL` in frontend

---

**API Documentation**: http://localhost:8000/docs  
**Alternative Docs**: http://localhost:8000/redoc
