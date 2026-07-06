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

	"github.com/google/generative-ai-go/genai"
	"github.com/hardikbhanot/archforge/backend/internal/parser"
	"google.golang.org/api/option"
)

type AIService struct {
	client        *genai.Client
	embeddingsDir string
}

func NewAIService(apiKey string, embeddingsDir string) (*AIService, error) {
	ctx := context.Background()
	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return nil, fmt.Errorf("failed to create gemini client: %w", err)
	}

	if err := os.MkdirAll(embeddingsDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create embeddings directory: %w", err)
	}

	return &AIService{
		client:        client,
		embeddingsDir: embeddingsDir,
	}, nil
}

func (s *AIService) Close() {
	if s.client != nil {
		s.client.Close()
	}
}

// GetOrGenerateEmbeddings returns the embeddings for a project's symbols, loading from cache if available.
func (s *AIService) GetOrGenerateEmbeddings(ctx context.Context, projectID string, symbols []parser.Symbol) (map[string][]float32, error) {
	embedPath := filepath.Join(s.embeddingsDir, fmt.Sprintf("%s.json", projectID))

	// Try loading from cache
	if data, err := os.ReadFile(embedPath); err == nil {
		var cached map[string][]float32
		if err := json.Unmarshal(data, &cached); err == nil {
			log.Printf("AIService: Loaded cached embeddings for project %s", projectID)
			return cached, nil
		}
	}

	log.Printf("AIService: Generating new embeddings for %d symbols in project %s", len(symbols), projectID)
	embeddings := make(map[string][]float32)
	em := s.client.EmbeddingModel("text-embedding-004")

	// Process in batches of 100 to avoid request too large errors
	batchSize := 100
	for i := 0; i < len(symbols); i += batchSize {
		end := i + batchSize
		if end > len(symbols) {
			end = len(symbols)
		}

		batch := symbols[i:end]
		var texts []string
		for _, sym := range batch {
			// Construct a rich text representation of the symbol for embedding
			text := fmt.Sprintf("Symbol Name: %s\nKind: %s\nFile: %s", sym.Name, sym.Kind, sym.Location.File)
			texts = append(texts, text)
		}

		batchReq := em.NewBatch()
		for _, text := range texts {
			batchReq.AddContent(genai.Text(text))
		}
		
		res, err := em.BatchEmbedContents(ctx, batchReq)
		if err != nil {
			return nil, fmt.Errorf("failed to generate embeddings batch: %w", err)
		}

		for j, emb := range res.Embeddings {
			symID := batch[j].ID
			embeddings[symID] = emb.Values
		}
	}

	// Cache the result
	if data, err := json.Marshal(embeddings); err == nil {
		_ = os.WriteFile(embedPath, data, 0644)
	}

	return embeddings, nil
}

// SearchSymbols finds the top K most similar symbols to the query.
func (s *AIService) SearchSymbols(ctx context.Context, query string, embeddings map[string][]float32, allSymbols []parser.Symbol, topK int) ([]parser.Symbol, error) {
	em := s.client.EmbeddingModel("text-embedding-004")
	res, err := em.EmbedContent(ctx, genai.Text(query))
	if err != nil {
		return nil, fmt.Errorf("failed to embed query: %w", err)
	}
	queryVec := res.Embedding.Values

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

func (s *AIService) AnswerQuery(ctx context.Context, query string, contextSymbols []parser.Symbol) (string, error) {
	model := s.client.GenerativeModel("gemini-1.5-flash")
	model.SetTemperature(0.2) // Low temperature for factual RAG responses

	var contextBuilder string
	for _, sym := range contextSymbols {
		contextBuilder += fmt.Sprintf("Symbol: %s (Kind: %s, File: %s)\n", sym.Name, sym.Kind, sym.Location.File)
		if sym.Documentation != "" {
			contextBuilder += fmt.Sprintf("Documentation: %s\n", sym.Documentation)
		}
		contextBuilder += "---\n"
	}

	prompt := fmt.Sprintf(`You are ArchForge AI, an expert software architecture assistant.
The user is asking a question about their codebase. Below is a list of relevant architectural symbols (classes, functions, etc.) retrieved from the codebase based on their semantic similarity to the query.

Use ONLY the provided context to answer the question. If the answer cannot be determined from the context, say "I don't have enough context to answer that accurately."
Always cite the File path when referring to a symbol. Keep your answer concise, technical, and helpful.

RELEVANT CONTEXT:
%s

USER QUESTION: %s`, contextBuilder, query)

	resp, err := model.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		return "", fmt.Errorf("failed to generate answer: %w", err)
	}

	if len(resp.Candidates) > 0 && len(resp.Candidates[0].Content.Parts) > 0 {
		if textPart, ok := resp.Candidates[0].Content.Parts[0].(genai.Text); ok {
			return string(textPart), nil
		}
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
