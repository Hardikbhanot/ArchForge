package parser

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"github.com/hardikbhanot/archforge/backend/internal/auth"
	"github.com/hardikbhanot/archforge/backend/internal/project"
)

type errorResponse struct {
	Error string `json:"error"`
}

type ParserHandler struct {
	ProjStore project.ProjectStore
	Service   *ParserService
}

func NewParserHandler(projStore project.ProjectStore, service *ParserService) *ParserHandler {
	return &ParserHandler{
		ProjStore: projStore,
		Service:   service,
	}
}

func (h *ParserHandler) Parse(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "method not allowed"})
		return
	}

	userID, _, ok := auth.UserFromContext(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "unauthorized"})
		return
	}

	projectID := r.PathValue("id")
	if projectID == "" {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "missing project ID"})
		return
	}

	proj, err := h.ProjStore.GetByID(projectID)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "project not found"})
		return
	}

	if proj.OwnerID != userID {
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "forbidden"})
		return
	}

	// Verify the project clone is completed before parsing
	if proj.Status != project.StatusCompleted && proj.Status != project.StatusParsed && proj.Status != project.StatusFailed {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "project repository must be cloned before parsing"})
		return
	}

	// Trigger async parsing task
	h.Service.ParseProject(proj)

	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"message": "parsing initiated",
		"status":  "PARSING",
	})
}

func (h *ParserHandler) GetIR(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "method not allowed"})
		return
	}

	userID, _, ok := auth.UserFromContext(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "unauthorized"})
		return
	}

	projectID := r.PathValue("id")
	if projectID == "" {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "missing project ID"})
		return
	}

	proj, err := h.ProjStore.GetByID(projectID)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "project not found"})
		return
	}

	if proj.OwnerID != userID {
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "forbidden"})
		return
	}

	irPath := filepath.Join(h.Service.OutputDir, fmt.Sprintf("%s.json", projectID))
	irFile, err := os.Open(irPath)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "IR metadata has not been generated for this project yet"})
		return
	}
	defer irFile.Close()

	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, irFile)
}

func (h *ParserHandler) GetGraph(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "method not allowed"})
		return
	}

	userID, _, ok := auth.UserFromContext(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "unauthorized"})
		return
	}

	projectID := r.PathValue("id")
	if projectID == "" {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "missing project ID"})
		return
	}

	proj, err := h.ProjStore.GetByID(projectID)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "project not found"})
		return
	}

	if proj.OwnerID != userID {
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "forbidden"})
		return
	}

	irPath := filepath.Join(h.Service.OutputDir, fmt.Sprintf("%s.json", projectID))

	// Optional: drill into a specific package's files via ?pkg=<name>
	pkg := r.URL.Query().Get("pkg")
	var (graph *GraphResponse; graphErr error)
	if pkg != "" {
		graph, graphErr = CompileFileGraph(irPath, pkg)
	} else {
		graph, graphErr = CompileProjectGraph(irPath)
	}
	if graphErr != nil {
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "IR metadata has not been generated for this project yet"})
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(graph)
}

func (h *ParserHandler) GetDocs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "method not allowed"})
		return
	}

	userID, _, ok := auth.UserFromContext(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "unauthorized"})
		return
	}

	projectID := r.PathValue("id")
	if projectID == "" {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "missing project ID"})
		return
	}

	proj, err := h.ProjStore.GetByID(projectID)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "project not found"})
		return
	}

	if proj.OwnerID != userID {
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "forbidden"})
		return
	}

	irPath := filepath.Join(h.Service.OutputDir, fmt.Sprintf("%s.json", projectID))
	docs, err := GenerateSystemDocs(irPath)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "IR metadata has not been generated for this project yet"})
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(docs)
}
