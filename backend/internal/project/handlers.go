package project

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/hardikbhanot/archforge/backend/internal/auth"
)

type importRequest struct {
	GitURL string `json:"git_url"`
	Branch string `json:"branch"`
}

type errorResponse struct {
	Error string `json:"error"`
}

type ProjectHandler struct {
	Store  ProjectStore
	Cloner *Cloner
}

func NewProjectHandler(store ProjectStore, cloner *Cloner) *ProjectHandler {
	return &ProjectHandler{
		Store:  store,
		Cloner: cloner,
	}
}

func generateID() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "project-" + time.Now().Format("20060102150405")
	}
	return hex.EncodeToString(bytes)
}

func getRepoName(gitURL string) string {
	s := strings.TrimSuffix(gitURL, "/")
	s = strings.TrimSuffix(s, ".git")

	if !strings.Contains(s, "/") && !strings.Contains(s, ":") {
		return "unknown-repository"
	}

	if idx := strings.LastIndex(s, "/"); idx != -1 {
		return s[idx+1:]
	}
	if idx := strings.LastIndex(s, ":"); idx != -1 {
		return s[idx+1:]
	}

	return "unknown-repository"
}


func (h *ProjectHandler) Import(w http.ResponseWriter, r *http.Request) {
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

	var req importRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "invalid request body"})
		return
	}

	if req.GitURL == "" {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "git_url is required"})
		return
	}

	p := &Project{
		ID:        generateID(),
		Name:      getRepoName(req.GitURL),
		GitURL:    req.GitURL,
		Branch:    req.Branch,
		Status:    StatusPending,
		OwnerID:   userID,
		CreatedAt: time.Now(),
	}

	if err := h.Store.Create(p); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "failed to save project"})
		return
	}

	// Trigger async cloning
	h.Cloner.StartClone(p)

	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(p)
}

func (h *ProjectHandler) List(w http.ResponseWriter, r *http.Request) {
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

	list, err := h.Store.ListByOwner(userID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "failed to retrieve projects"})
		return
	}

	if list == nil {
		list = []*Project{}
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(list)
}

func (h *ProjectHandler) Get(w http.ResponseWriter, r *http.Request) {
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

	// Use Go 1.22 path values
	projectID := r.PathValue("id")
	if projectID == "" {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "missing project ID"})
		return
	}

	p, err := h.Store.GetByID(projectID)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "project not found"})
		return
	}

	if p.OwnerID != userID {
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "forbidden"})
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(p)
}

func (h *ProjectHandler) Delete(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodDelete {
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

	p, err := h.Store.GetByID(projectID)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "project not found"})
		return
	}

	if p.OwnerID != userID {
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "forbidden"})
		return
	}

	// 1. Delete physical cloned files
	if p.LocalPath != "" {
		_ = os.RemoveAll(p.LocalPath)
	}

	// 2. Delete generated IR file
	irPath := filepath.Join("./data/ir", p.ID+".json")
	_ = os.Remove(irPath)

	// 3. Delete database record
	if err := h.Store.Delete(p.ID); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "failed to delete project database record"})
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"message": "project deleted successfully",
		"id":      p.ID,
	})
}
