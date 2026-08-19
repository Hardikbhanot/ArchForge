package ai

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"google.golang.org/genai"
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
	answer, err := h.Service.AnswerQuery(r.Context(), req.Message, topSymbols, projectIR)
	if err != nil {
		json.NewEncoder(w).Encode(ChatResponse{Error: "Failed to generate AI response: " + err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ChatResponse{Answer: answer})
}

func (h *AIHandler) HandleGenerateHLD(w http.ResponseWriter, r *http.Request) {
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

	irPath := filepath.Join(h.IrDir, repoHash+".json")
	irData, err := os.ReadFile(irPath)
	if err != nil {
		http.Error(w, "Project IR not found. Please analyze codebase first.", http.StatusNotFound)
		return
	}

	var projectIR parser.ProjectIR
	if err := json.Unmarshal(irData, &projectIR); err != nil {
		http.Error(w, "Failed to parse project IR", http.StatusInternalServerError)
		return
	}

	// For HLD, we want to give the AI an overview of the architecture without blowing up the context window.
	// We'll strip the massive code snippets and only pass the structural declarations.
	var architectureContext string
	for _, sym := range projectIR.Symbols {
		// Only include structural components and infrastructure
		isAppStruct := sym.Kind == "Class" || sym.Kind == "Interface" || sym.Kind == "Struct" || sym.Kind == "Module"
		isInfra := strings.HasPrefix(sym.Kind, "K8s_") || strings.HasPrefix(sym.Kind, "TF_") || sym.Kind == "ContainerImage" || sym.Kind == "ComposeService" || sym.Kind == "NetworkPort"
		
		if isAppStruct || isInfra {
			architectureContext += fmt.Sprintf("- %s (%s) in %s\n", sym.Name, sym.Kind, sym.Location.File)
		}
	}
	
	// If it's a small project, just pass everything. But for safety, keep it structural.
	if architectureContext == "" {
		for i, sym := range projectIR.Symbols {
			if i > 100 { break } // cap at 100
			architectureContext += fmt.Sprintf("- %s (%s) in %s\n", sym.Name, sym.Kind, sym.Location.File)
		}
	}

	prompt := fmt.Sprintf(`You are an expert Software Architect.
Based on the following architectural components of the codebase, generate a highly polished, premium High-Level Design (HLD) document in Markdown.

You MUST strictly follow this exact structure and formatting:

# High-Level Design (HLD): [Project Name]

## 1. Introduction
Write a brief, high-level summary of what this project does and its core purpose.

---

## 2. Architecture Overview
Provide a short overview of the architectural pattern.

### 2.1 Core Mermaid.js Diagram
Generate a beautifully styled Mermaid.js graph. You MUST use 'classDef' to style the nodes with modern, dark-theme friendly colors (e.g., classDef default fill:#1e1e2f,stroke:#8b5cf6,stroke-width:2px,color:#fff). Use subgraphs to group related services or layers.

---

## 3. Top-Level Basic Services & Roles
Break down the top 3 to 5 most important services, components, or folders found in the components list. For each, use this format:

### 3.X [Component Name]
- **Role**: [Brief description of what it does]
- **Interactions**: [What other components does it talk to and how?]

Codebase Components:
%s
`, architectureContext)

	// We use the existing AI service to call Gemini
	var temp float32 = 0.2
	resp, err := h.Service.client.Models.GenerateContent(r.Context(), "gemini-3.6-flash", genai.Text(prompt), &genai.GenerateContentConfig{
		Temperature: &temp,
	})
	
	if err != nil || len(resp.Candidates) == 0 || len(resp.Candidates[0].Content.Parts) == 0 {
		http.Error(w, "Failed to generate HLD via AI", http.StatusInternalServerError)
		return
	}

	hldMarkdown := resp.Candidates[0].Content.Parts[0].Text

	filename := fmt.Sprintf("%s-hld.md", proj.Name)
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	w.Header().Set("Content-Type", "text/markdown")
	
	// Important: Send the markdown as the response body
	w.Write([]byte(hldMarkdown))
}

type ExtensionChatRequest struct {
	Code     string `json:"code"`
	Question string `json:"question"`
}

func (h *AIHandler) HandleExtensionChat(w http.ResponseWriter, r *http.Request) {
	var req ExtensionChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	prompt := fmt.Sprintf(`You are ArchForge AI, an expert software architecture assistant operating inside the user's IDE.
The user has highlighted the following code and asked a question.

Highlighted Code:
%s

Question:
%s

Provide a concise, direct, and highly focused answer. 
- Do NOT generate a massive, overly-verbose report for simple questions or small snippets.
- Use simple, easy-to-read formatting.
- Focus strictly on answering the specific question asked, pointing out architectural impacts or best practices only if highly relevant.`, req.Code, req.Question)

	var temp float32 = 0.2
	resp, err := h.Service.client.Models.GenerateContent(r.Context(), "gemini-3.6-flash", genai.Text(prompt), &genai.GenerateContentConfig{
		Temperature: &temp,
	})

	if err != nil || len(resp.Candidates) == 0 || len(resp.Candidates[0].Content.Parts) == 0 {
		json.NewEncoder(w).Encode(ChatResponse{Error: "Failed to generate AI response: " + err.Error()})
		return
	}

	answer := string(resp.Candidates[0].Content.Parts[0].Text)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ChatResponse{Answer: answer})
}
