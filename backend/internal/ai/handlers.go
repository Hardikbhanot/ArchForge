package ai

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/hardikbhanot/archforge/backend/internal/parser"
	"github.com/hardikbhanot/archforge/backend/internal/project"
	"github.com/hardikbhanot/archforge/backend/internal/utils"
)

type AIHandler struct {
	Service   *AIService
	IrDir     string
	ProjStore project.ProjectStore
}

func NewAIHandler(service *AIService, irDir string, projStore project.ProjectStore) *AIHandler {
	return &AIHandler{
		Service:   service,
		IrDir:     irDir,
		ProjStore: projStore,
	}
}

type ChatRequest struct {
	Message string `json:"message"`
}

type ChatResponse struct {
	Answer string `json:"answer"`
	Error  string `json:"error,omitempty"`
}

func (h *AIHandler) HandleChat(w http.ResponseWriter, r *http.Request) {
	// Extract projectID from URL (e.g., /api/projects/{id}/chat)
	parts := strings.Split(r.URL.Path, "/")
	var projectID string
	for i, part := range parts {
		if part == "projects" && i+1 < len(parts) {
			projectID = parts[i+1]
			break
		}
	}

	if projectID == "" {
		http.Error(w, "project ID required", http.StatusBadRequest)
		return
	}

	proj, err := h.ProjStore.GetByID(projectID)
	if err != nil {
		http.Error(w, "project not found", http.StatusNotFound)
		return
	}
	repoHash := utils.GenerateRepoHash(proj.GitURL, proj.Branch)

	var req ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// 1. Load the IR JSON for this project using hash
	irPath := filepath.Join(h.IrDir, repoHash+".json")
	irData, err := os.ReadFile(irPath)
	if err != nil {
		json.NewEncoder(w).Encode(ChatResponse{Error: "Project IR not found. Ensure the project is fully parsed."})
		return
	}

	var projectIR parser.ProjectIR
	if err := json.Unmarshal(irData, &projectIR); err != nil {
		http.Error(w, "failed to parse project IR", http.StatusInternalServerError)
		return
	}

	// 2. Load or generate embeddings for the symbols
	store, err := h.Service.GetOrGenerateEmbeddings(r.Context(), repoHash, projectIR.Symbols)
	if err != nil {
		json.NewEncoder(w).Encode(ChatResponse{Error: "Failed to load embeddings: " + err.Error()})
		return
	}

	// 3. Search for the top 15 most relevant symbols
	topSymbols, err := h.Service.SearchSymbols(r.Context(), store.Provider, req.Message, store.Embeddings, projectIR.Symbols, 15)
	if err != nil {
		json.NewEncoder(w).Encode(ChatResponse{Error: "Semantic search failed: " + err.Error()})
		return
	}

	// 4. Generate the RAG answer using Gemini
	answer, err := h.Service.AnswerQuery(r.Context(), req.Message, topSymbols)
	if err != nil {
		json.NewEncoder(w).Encode(ChatResponse{Error: "Failed to generate AI response: " + err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ChatResponse{Answer: answer})
}
