package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"google.golang.org/genai"
	"github.com/hardikbhanot/archforge/backend/internal/parser"
)

type AIService struct {
	client        *genai.Client // Still used for LLM text generation
	hfAPIKey      string
	voyageAPIKey  string
	embeddingsDir string
}

func NewAIService(geminiAPIKey, hfAPIKey, voyageAPIKey, embeddingsDir string) (*AIService, error) {
	ctx := context.Background()
	client, err := genai.NewClient(ctx, &genai.ClientConfig{APIKey: geminiAPIKey})
	if err != nil {
		return nil, fmt.Errorf("failed to create gemini client: %w", err)
	}

	if err := os.MkdirAll(embeddingsDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create embeddings directory: %w", err)
	}

	return &AIService{
		client:        client,
		hfAPIKey:      hfAPIKey,
		voyageAPIKey:  voyageAPIKey,
		embeddingsDir: embeddingsDir,
	}, nil
}

func (s *AIService) Close() {
	// The new genai.Client does not require Close()
}

// GetOrGenerateEmbeddings returns the embeddings for a project's symbols, loading from cache if available.
func (s *AIService) GetOrGenerateEmbeddings(ctx context.Context, projectID string, symbols []parser.Symbol) (*EmbeddingStore, error) {
	embedPath := filepath.Join(s.embeddingsDir, fmt.Sprintf("%s.json", projectID))

	// Try loading from cache
	if data, err := os.ReadFile(embedPath); err == nil {
		var cached EmbeddingStore
		if err := json.Unmarshal(data, &cached); err == nil && cached.Provider != "" {
			log.Printf("AIService: Loaded cached embeddings (provider: %s) for project %s", cached.Provider, projectID)
			return &cached, nil
		}
	}

	log.Printf("AIService: Generating new embeddings for %d symbols in project %s", len(symbols), projectID)
	
	// Prepare texts
	var texts []string
	for _, sym := range symbols {
		text := fmt.Sprintf("Symbol Name: %s\nKind: %s\nFile: %s", sym.Name, sym.Kind, sym.Location.File)
		texts = append(texts, text)
	}

	var embeddings [][]float32
	var err error
	provider := "huggingface"

	// Try HuggingFace first
	if s.hfAPIKey != "" {
		log.Printf("AIService: Attempting HuggingFace API for embeddings...")
		embeddings, err = getHuggingFaceEmbeddings(ctx, s.hfAPIKey, texts)
	}

	// Fallback to Voyage AI if HuggingFace failed or is not configured
	if err != nil || s.hfAPIKey == "" {
		if err != nil {
			log.Printf("AIService: HuggingFace failed (%v). Falling back to Voyage AI...", err)
		} else {
			log.Printf("AIService: HuggingFace key not provided. Attempting Voyage AI...")
		}
		
		if s.voyageAPIKey != "" {
			provider = "voyage"
			embeddings, err = getVoyageEmbeddings(ctx, s.voyageAPIKey, texts)
		} else {
			return nil, fmt.Errorf("no valid embedding providers available. HF error: %v", err)
		}
	}
	
	if err != nil {
		return nil, fmt.Errorf("all embedding providers failed. Last error: %w", err)
	}

	// Map embeddings back to symbol IDs
	embeddingsMap := make(map[string][]float32)
	for i, emb := range embeddings {
		if i < len(symbols) {
			symID := symbols[i].ID
			embeddingsMap[symID] = emb
		}
	}

	store := &EmbeddingStore{
		Provider:   provider,
		Embeddings: embeddingsMap,
	}

	// Cache the result
	if data, err := json.Marshal(store); err == nil {
		_ = os.WriteFile(embedPath, data, 0644)
	}

	return store, nil
}

// SearchSymbols finds the top K most similar symbols to the query.
func (s *AIService) SearchSymbols(ctx context.Context, provider string, query string, embeddings map[string][]float32, allSymbols []parser.Symbol, topK int) ([]parser.Symbol, error) {
	var queryVec []float32

	if provider == "huggingface" {
		if s.hfAPIKey == "" {
			return nil, fmt.Errorf("HuggingFace provider specified, but no key configured")
		}
		res, err := getHuggingFaceEmbeddings(ctx, s.hfAPIKey, []string{query})
		if err != nil || len(res) == 0 {
			return nil, fmt.Errorf("failed to embed query with HuggingFace: %w", err)
		}
		queryVec = res[0]
	} else if provider == "voyage" {
		if s.voyageAPIKey == "" {
			return nil, fmt.Errorf("Voyage AI provider specified, but no key configured")
		}
		res, err := getVoyageEmbeddings(ctx, s.voyageAPIKey, []string{query})
		if err != nil || len(res) == 0 {
			return nil, fmt.Errorf("failed to embed query with Voyage AI: %w", err)
		}
		queryVec = res[0]
	} else {
		return nil, fmt.Errorf("unknown embedding provider: %s", provider)
	}

	type scoredSymbol struct {
		symbol parser.Symbol
		score  float32
	}

	var scored []scoredSymbol
	for _, sym := range allSymbols {
		vec, ok := embeddings[sym.ID]
		if !ok {
			continue
		}
		score := cosineSimilarity(queryVec, vec)
		scored = append(scored, scoredSymbol{symbol: sym, score: score})
	}

	// Sort by descending score
	sort.Slice(scored, func(i, j int) bool {
		return scored[i].score > scored[j].score
	})

	var results []parser.Symbol
	for i := 0; i < len(scored) && i < topK; i++ {
		results = append(results, scored[i].symbol)
	}

	return results, nil
}

func (s *AIService) AnswerQuery(ctx context.Context, query string, contextSymbols []parser.Symbol, projectIR parser.ProjectIR) (string, error) {
	var contextBuilder string
	for _, sym := range contextSymbols {
		contextBuilder += fmt.Sprintf("Symbol: %s (Kind: %s, File: %s)\n", sym.Name, sym.Kind, sym.Location.File)
		if sym.Documentation != "" {
			contextBuilder += fmt.Sprintf("Documentation: %s\n", sym.Documentation)
		}
		if sym.CodeSnippet != "" {
			contextBuilder += fmt.Sprintf("Source Code:\n```\n%s\n```\n", sym.CodeSnippet)
		}
		contextBuilder += "---\n"
	}

	var globalContext string
	for _, sym := range projectIR.Symbols {
		isAppStruct := sym.Kind == "Class" || sym.Kind == "Interface" || sym.Kind == "Struct" || sym.Kind == "Module"
		isInfra := strings.HasPrefix(sym.Kind, "K8s_") || strings.HasPrefix(sym.Kind, "TF_") || sym.Kind == "ContainerImage" || sym.Kind == "ComposeService" || sym.Kind == "NetworkPort"
		
		if isAppStruct || isInfra {
			globalContext += fmt.Sprintf("- %s (%s) in %s\n", sym.Name, sym.Kind, sym.Location.File)
		}
	}
	if len(globalContext) > 3000 {
		globalContext = globalContext[:3000] + "\n... (truncated)"
	}

	prompt := fmt.Sprintf(`You are ArchForge AI, an expert software architecture assistant.
The user is asking a question about their codebase. Below is a list of relevant architectural symbols (classes, functions, etc.) retrieved from the codebase based on their semantic similarity to the query.

To help you answer broad questions about the project's overall complexity, architecture, or external APIs, here is a global map of the project's key structural components:
GLOBAL ARCHITECTURE MAP:
%s

RELEVANT CODE SNIPPETS (Detailed Context):
%s

USER QUESTION: %s

Use both the global map and the detailed snippets to answer the question. You are no longer strictly limited to only the snippets if the global map provides the answer. If the answer still cannot be reasonably determined, say "I don't have enough context to answer that accurately."
Always cite the File path when referring to a symbol. Keep your answer concise, but explain the concepts clearly so that even a beginner or layman can easily understand the logic. Use simple analogies if it helps explain complex flows.`, globalContext, contextBuilder, query)

	var temp float32 = 0.2
	resp, err := s.client.Models.GenerateContent(ctx, "gemini-3.6-flash", genai.Text(prompt), &genai.GenerateContentConfig{
		Temperature: &temp,
	})
	
	if err != nil {
		return "", fmt.Errorf("failed to generate answer: %w", err)
	}

	if len(resp.Candidates) > 0 && len(resp.Candidates[0].Content.Parts) > 0 {
		return resp.Candidates[0].Content.Parts[0].Text, nil
	}

	return "No answer generated.", nil
}

func cosineSimilarity(a, b []float32) float32 {
	if len(a) != len(b) {
		return 0.0
	}
	var dotProduct, normA, normB float32
	for i := 0; i < len(a); i++ {
		dotProduct += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}
	if normA == 0 || normB == 0 {
		return 0.0
	}
	return dotProduct / (float32(math.Sqrt(float64(normA))) * float32(math.Sqrt(float64(normB))))
}
