# ArchForge

ArchForge is an AI-native software architecture intelligence platform for understanding, indexing, and reasoning about software repositories. The MVP focuses on repository ingestion, language-agnostic parsing, hybrid retrieval, architecture visualization, and AI-assisted exploration.

## Stack
- Backend: Go
- Frontend: Angular
- Database: PostgreSQL (planned)
- Auth: JWT (planned)

## Current Status
The repository now contains a runnable scaffold for:
- a Go backend API with health and overview endpoints
- an Angular frontend landing page
- an implementation plan document

## Run Locally

### Backend
```bash
cd backend
go run ./cmd/server
```

The API will be available at:
- http://127.0.0.1:8080/health
- http://127.0.0.1:8080/api/v1/overview

### Frontend
```bash
cd frontend
npm start
```

The frontend will be available at:
- http://localhost:4200/

## Project Roadmap
1. Authentication and user sessions
2. Repository import from GitHub and ZIP uploads
3. Parser framework and intermediate representation (IR)
4. Graph and semantic retrieval
5. AI chat and documentation generation
6. Docker packaging and deployment
