# Course Co-Pilot - Technical Specifications

## Architecture Overview

Course Co-Pilot is a RAG-based Q&A system designed with safety and accuracy as primary concerns for K12 education.

## System Components

### Frontend (Current - React/Vite)
```
┌─────────────────────────────────────────┐
│         React Frontend (Vite)           │
├─────────────────────────────────────────┤
│  - MainPage (Landing)                   │
│  - Login/Signup (Auth)                  │
│  - DocumentUpload (Q&A Interface)       │
│  - Role Management (Student/Teacher)    │
│  - Mode Toggle (Deterministic/Explor.)  │
└─────────────────────────────────────────┘
```

### Backend Architecture (To Be Implemented)

```
┌──────────────────────────────────────────────────┐
│              FastAPI Backend                      │
├──────────────────────────────────────────────────┤
│                                                   │
│  ┌─────────────┐      ┌──────────────┐          │
│  │   Auth      │      │   RAG        │          │
│  │   Service   │◄────►│   Pipeline   │          │
│  └─────────────┘      └──────────────┘          │
│                              │                    │
│                              ▼                    │
│                    ┌──────────────────┐          │
│                    │  Document Store  │          │
│                    │  (FAISS/Chroma)  │          │
│                    └──────────────────┘          │
│                              │                    │
│                              ▼                    │
│                    ┌──────────────────┐          │
│                    │   LLM Service    │          │
│                    │ (OpenAI/Claude)  │          │
│                    └──────────────────┘          │
└──────────────────────────────────────────────────┘
```

## Technology Stack

### Frontend Technologies
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.2+ | UI Framework |
| React Router | 6.20+ | Client-side routing |
| Vite | 5.0+ | Build tool & dev server |
| CSS3 | - | Styling & animations |

### Backend Technologies (Planned)
| Technology | Purpose | Priority |
|------------|---------|----------|
| Python 3.10+ | Backend language | High |
| FastAPI | REST API framework | High |
| Pydantic | Data validation | High |
| FAISS | Vector similarity search | High |
| Chroma | Vector database | Medium |
| LangChain | RAG orchestration | High |
| LlamaIndex | Document indexing | Medium |
| OpenAI SDK | GPT models | High |
| Claude SDK | Anthropic models | Medium |
| Gemini SDK | Google models | Low |
| Docker | Containerization | High |
| pytest | Testing framework | High |

## RAG Pipeline Design

### 1. Document Processing
```python
# Pseudocode
def process_curriculum_documents(documents):
    """
    Process and chunk curriculum documents
    """
    chunks = []
    for doc in documents:
        # Chunk by semantic boundaries (paragraphs, sections)
        doc_chunks = semantic_chunker.chunk(
            doc, 
            chunk_size=512,
            overlap=50
        )
        
        # Add metadata
        for chunk in doc_chunks:
            chunk.metadata = {
                'source': doc.name,
                'page': chunk.page_number,
                'section': chunk.section_title,
                'course': extract_course(doc)
            }
        
        chunks.extend(doc_chunks)
    
    return chunks
```

### 2. Embedding & Indexing
```python
def index_documents(chunks, vector_store):
    """
    Create embeddings and index in vector store
    """
    embeddings = embedding_model.embed(
        [chunk.text for chunk in chunks]
    )
    
    vector_store.add(
        embeddings=embeddings,
        documents=chunks,
        ids=[chunk.id for chunk in chunks]
    )
```

### 3. Retrieval Pipeline
```python
def retrieve_relevant_chunks(query, k=5):
    """
    Retrieve top-k relevant chunks with re-ranking
    """
    # Initial retrieval
    query_embedding = embedding_model.embed(query)
    candidates = vector_store.search(
        query_embedding, 
        k=k*2  # Over-retrieve for re-ranking
    )
    
    # Re-rank by relevance
    reranked = reranker.rank(
        query=query,
        documents=candidates,
        top_k=k
    )
    
    return reranked
```

### 4. Response Generation
```python
async def generate_answer(query, mode='deterministic', user_role='student'):
    """
    Generate answer with citations and confidence
    """
    # Retrieve relevant chunks
    chunks = retrieve_relevant_chunks(query, k=5)
    
    # Build context with citations
    context = build_context_with_citations(chunks)
    
    # Select prompt based on mode and role
    prompt = get_prompt(
        mode=mode,
        role=user_role,
        query=query,
        context=context
    )
    
    # Generate response
    response = await llm.generate(
        prompt=prompt,
        temperature=0.0 if mode == 'deterministic' else 0.3,
        max_tokens=500
    )
    
    # Extract confidence score
    confidence = calculate_confidence(
        response=response,
        retrieved_chunks=chunks
    )
    
    # Verify citations
    citations = extract_and_verify_citations(
        response=response,
        source_chunks=chunks
    )
    
    return {
        'answer': response.text,
        'confidence': confidence,
        'citations': citations,
        'mode': mode
    }
```

## Safety Guardrails

### 1. Confidence Scoring
```python
def calculate_confidence(response, retrieved_chunks):
    """
    Calculate confidence based on multiple factors
    """
    factors = {
        'retrieval_score': max([c.score for c in retrieved_chunks]),
        'citation_coverage': count_citations(response) / len(retrieved_chunks),
        'answer_length': len(response.text.split()),
        'uncertainty_markers': count_uncertainty_words(response.text)
    }
    
    # Weighted combination
    confidence = (
        factors['retrieval_score'] * 0.4 +
        factors['citation_coverage'] * 0.3 +
        min(factors['answer_length'] / 100, 1.0) * 0.2 -
        factors['uncertainty_markers'] * 0.1
    )
    
    return max(0, min(100, confidence * 100))
```

### 2. Hallucination Detection
```python
def detect_hallucination(response, source_chunks):
    """
    Check if response contains unsupported claims
    """
    claims = extract_claims(response)
    
    for claim in claims:
        if not verify_claim_in_sources(claim, source_chunks):
            return {
                'is_hallucination': True,
                'unsupported_claim': claim
            }
    
    return {'is_hallucination': False}
```

### 3. Scope Control
```python
ALLOWED_TOPICS = [
    'entrepreneurship_program',
    'financial_literacy',
    'course_schedule',
    'assignments',
    'curriculum_content'
]

def check_scope(query):
    """
    Verify query is within allowed scope
    """
    topic = classify_query_topic(query)
    
    if topic not in ALLOWED_TOPICS:
        return {
            'in_scope': False,
            'refusal_message': "I can only answer questions about your course curriculum and program details."
        }
    
    return {'in_scope': True}
```

## API Endpoints

### Authentication
```
POST /api/auth/signup
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/user
```

### Q&A Interface
```
POST /api/chat/query
  Body: {
    "query": string,
    "mode": "deterministic" | "exploratory",
    "user_role": "student" | "teacher"
  }
  Response: {
    "answer": string,
    "confidence": number,
    "citations": [string],
    "mode": string
  }

GET /api/chat/history
```

### Document Management
```
POST /api/documents/upload
GET  /api/documents/list
DELETE /api/documents/{id}
```

## Database Schema

### Users Table
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role ENUM('student', 'teacher') NOT NULL,
    age INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Chat History Table
```sql
CREATE TABLE chat_history (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    query TEXT NOT NULL,
    answer TEXT NOT NULL,
    confidence DECIMAL(5,2),
    mode VARCHAR(50),
    citations JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Documents Table
```sql
CREATE TABLE documents (
    id UUID PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(50),
    content_hash VARCHAR(64),
    course_type VARCHAR(100),
    uploaded_by UUID REFERENCES users(id),
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);
```

## Evaluation Metrics

### Retrieval Quality
- **Precision@k**: Proportion of retrieved chunks that are relevant
- **Recall@k**: Proportion of relevant chunks that are retrieved
- **MRR (Mean Reciprocal Rank)**: Position of first relevant result

### Response Quality
- **Citation Accuracy**: Percentage of citations that correctly reference source
- **Hallucination Rate**: Percentage of responses with unsupported claims
- **Confidence Calibration**: Alignment between confidence scores and actual accuracy

### User Experience
- **Response Time**: Average time to generate answer
- **User Satisfaction**: Student/teacher feedback ratings
- **Task Completion**: Percentage of queries successfully answered

## Testing Strategy

### Unit Tests
```python
# Test retrieval
def test_retrieval_returns_relevant_chunks():
    query = "What is the entrepreneurship program about?"
    chunks = retrieve_relevant_chunks(query, k=5)
    assert len(chunks) == 5
    assert all(c.score > 0.7 for c in chunks)

# Test confidence calculation
def test_confidence_score_ranges():
    confidence = calculate_confidence(response, chunks)
    assert 0 <= confidence <= 100
```

### Integration Tests
```python
# Test full pipeline
async def test_end_to_end_query():
    response = await generate_answer(
        query="How long are online missions?",
        mode='deterministic'
    )
    assert response['confidence'] > 75
    assert len(response['citations']) > 0
```

### Safety Tests
```python
# Test hallucination detection
def test_rejects_unsupported_claims():
    response = "The program includes space travel training."
    result = detect_hallucination(response, curriculum_chunks)
    assert result['is_hallucination'] == True

# Test scope control
def test_rejects_out_of_scope_query():
    result = check_scope("What's the weather today?")
    assert result['in_scope'] == False
```

## Environment Configuration

### .env File Structure
```bash
# API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/copilot
VECTOR_DB_PATH=./vector_store

# Security
JWT_SECRET=your-secret-key
JWT_ALGORITHM=HS256
JWT_EXPIRATION=3600

# Application
ENVIRONMENT=development
LOG_LEVEL=INFO
MAX_CHUNK_SIZE=512
RETRIEVAL_TOP_K=5
CONFIDENCE_THRESHOLD=75
```

## Deployment

### Docker Compose
```yaml
version: '3.8'

services:
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - REACT_APP_API_URL=http://localhost:8000

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    volumes:
      - ./vector_store:/app/vector_store

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=copilot
      - POSTGRES_USER=admin
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

## Performance Targets

| Metric | Target |
|--------|--------|
| Response Time (p95) | < 2 seconds |
| Retrieval Precision@5 | > 85% |
| Citation Accuracy | > 95% |
| Hallucination Rate | < 2% |
| Uptime | 99.5% |

## Compliance Checklist

- [ ] GDPR compliance for student data
- [ ] COPPA compliance (age verification)
- [ ] Data minimization practices
- [ ] Encryption at rest and in transit
- [ ] Audit logging
- [ ] Regular security assessments
- [ ] DPIA (Data Protection Impact Assessment)
- [ ] Accessibility standards (WCAG 2.1 AA)

---

**Document Version**: 1.0  
**Last Updated**: 2026-02-04  
**Status**: Implementation Ready
