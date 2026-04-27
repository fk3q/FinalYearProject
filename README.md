# Laboracle


A safe, low-hallucination Q&A assistant for  education that answers program, curriculum, and course-admin questions. Built for entrepreneurship accelerator and gamified financial literacy course.

## 🎯 Project Overview

Laboracle is designed to reduce teacher workload while keeping students moving through a hybrid flow of short online missions and classroom blocks. The system uses retrieval with citations and switches between deterministic and exploratory modes for safe, reliable learning assistance.

## ✨ Key Features

### Core Functionality
- **Safe Q&A System**: Low-hallucination responses with confidence scores
- **Citation-Backed Answers**: Every response includes source citations for verification
- **Dual AI Modes**: 
  - **Deterministic Mode**: Factual answers only from verified sources
  - **Exploratory Mode**: Creative connections and supplementary insights
- **Role-Based Interface**: Separate views for students and teachers
- **Confidence Scoring**: Transparency in AI certainty (High: 90%+, Medium: 75-89%, Low: <75%)

### Safety Features
- Age-appropriate content (K12: ages 9-17)
- Refusal patterns for out-of-scope questions
- Confidence thresholds to prevent hallucinations
- Citation verification and source tracking
- Student-safe guardrails

## 🏗️ Project Structure

```
├── App.jsx                 # Main application with routing
├── MainPage.jsx           # Landing page with program information
├── Login.jsx              # User authentication (login)
├── Signup.jsx             # User registration
├── DocumentUpload.jsx     # Main Q&A interface with chatbot
├── Auth.css              # Authentication pages styling
├── MainPage.css          # Landing page styling  
├── DocumentUpload.css    # Q&A interface styling
├── index.css             # Global styles
├── main.jsx              # React entry point
├── index.html            # HTML template
├── vite.config.js        # Vite configuration
└── package.json          # Project dependencies
```

## 🚀 Getting Started

### Prerequisites
- Node.js 16+ and npm

### Installation

1. **Navigate to project directory:**
```bash
cd C:\ComputerScienceProject
```

2. **Install dependencies:**
```bash
npm install
```

3. **Start development server:**
```bash
npm run dev
```

4. **Open your browser:**
```
http://localhost:3000
```

## 💻 Technology Stack

### Frontend (Current Implementation)
- **React 18.2** - UI framework
- **React Router DOM 6.20** - Client-side routing
- **Vite 5.0** - Build tool and dev server
- **CSS3** - Modern styling with animations

### Planned Backend Integration
- **Python/TypeScript** - Backend languages
- **FastAPI/Next.js** - API framework
- **FAISS/Chroma** - Vector stores for document retrieval
- **LangChain/LlamaIndex** - RAG orchestration
- **OpenAI/Claude/Gemini SDKs** - LLM integration
- **Docker** - Containerization
- **pytest** - Testing framework

## 📚 Course Content

Laboracle currently supports queries about:
- **Entrepreneurship Accelerator** (Ages 12-17)
  - Project-based learning
  - Real-world business skills
  - Mission-based curriculum

- **Financial Literacy Course** (Age 9)
  - Gamified learning
  - Money management basics
  - Interactive missions

## 🎨 User Interface Features

### Navigation
- Student/Teacher role switching
- Deterministic/Exploratory mode toggle
- Easy navigation between pages

### Chat Interface
- Real-time Q&A with typing indicators
- Confidence score badges (color-coded)
- Citation display for transparency
- Suggested questions for quick start
- Document upload for additional materials

### Safety Indicators
- Confidence levels: High (green), Medium (yellow), Low (red)
- Source citations for every answer
- Mode-specific responses (factual vs exploratory)

## 🔐 Safety & Compliance

- **Age-Appropriate**: Designed for K12 students (9-17 years)
- **Data Privacy**: No personal data collection in frontend demo
- **Safe Responses**: Confidence thresholds prevent uncertain answers
- **Citation Verification**: All claims backed by source documents
- **Scope Control**: Only answers course-related questions

## 📋 Candidate Requirements Met

✅ **RAG & IR**: Simulated chunking, embeddings, vector stores, citation stitching  
✅ **LLM Integration**: Structured JSON outputs, confidence scoring  
✅ **Evaluation**: Confidence thresholds, citation correctness  
✅ **Safety/Guardrails**: Confidence levels, scope pinning, dual modes  
✅ **Frontend**: TypeScript-ready React + routing, error states, citations  
✅ **Data & Compliance**: Student-safe design, accessibility-focused  

## 🎯 Future Development

### Backend Integration
- [ ] Connect to FastAPI backend
- [ ] Implement FAISS/Chroma vector stores
- [ ] Integrate OpenAI/Claude/Gemini APIs
- [ ] Add LangChain/LlamaIndex orchestration
- [ ] Implement actual RAG retrieval pipeline

### Enhanced Features
- [ ] Real-time citation verification
- [ ] Advanced confidence scoring algorithms
- [ ] Multi-document reasoning
- [ ] Progress tracking for students
- [ ] Teacher analytics dashboard
- [ ] Assignment integration

### Safety Enhancements
- [ ] Content filtering system
- [ ] Advanced hallucination detection
- [ ] Automated DPIA compliance checks
- [ ] Audit logging
- [ ] Parent/guardian controls

## 📖 Usage Guide

### For Students
1. Login with your credentials
2. Select "Student" role
3. Choose your preferred AI mode (Deterministic recommended for homework)
4. Ask questions about your course content
5. Review confidence scores and citations

### For Teachers
1. Login with teacher credentials
2. Select "Teacher" role
3. Access curriculum and admin questions
4. Upload additional course materials
5. Monitor student interactions (future feature)

## 🧪 Testing

```bash
# Run tests (when backend is integrated)
pytest

# Lint code
npm run lint

# Build for production
npm run build
```

## 📊 Evaluation Metrics

The system will be evaluated on:
- **Precision/Recall@k**: Retrieval accuracy
- **MRR**: Mean Reciprocal Rank
- **Citation Correctness**: Source accuracy
- **Hallucination Rate**: Unsupported claim detection
- **User Satisfaction**: Student and teacher feedback

## 🤝 Contributing

This is a Computer Science Project for Flosendo Limited. 

## 📄 License

ISC

## 📞 Support

For questions about the Laboracle project, please contact the project team.

---

**Built with ❤️ for better education**  
*Computer Science Project - 2026*
