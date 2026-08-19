package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"time"
)

type EmbeddingStore struct {
	Provider   string               `json:"provider"`
	Embeddings map[string][]float32 `json:"embeddings"`
}

type hfRequest struct {
	Inputs []string `json:"inputs"`
}

func getHuggingFaceEmbeddings(ctx context.Context, apiKey string, texts []string) ([][]float32, error) {
	url := "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2"
	
	reqBody, _ := json.Marshal(hfRequest{Inputs: texts})
	
	maxRetries := 5
	for attempt := 0; attempt < maxRetries; attempt++ {
		req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(reqBody))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+apiKey)
		req.Header.Set("Content-Type", "application/json")
		
		client := &http.Client{Timeout: 30 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
		
		bodyBytes, _ := io.ReadAll(resp.Body)
		
		if resp.StatusCode == 200 {
			var embeddings [][]float32
			if err := json.Unmarshal(bodyBytes, &embeddings); err != nil {
				return nil, fmt.Errorf("failed to parse HF response: %w", err)
			}
			return embeddings, nil
		}
		
		if resp.StatusCode == 429 || resp.StatusCode == 503 {
			sleepTime := time.Duration(math.Pow(2, float64(attempt))) * time.Second * 5
			log.Printf("HuggingFace rate limit/loading (status %d). Retrying in %v...", resp.StatusCode, sleepTime)
			time.Sleep(sleepTime)
			continue
		}
		
		return nil, fmt.Errorf("huggingface API error: status %d, body: %s", resp.StatusCode, string(bodyBytes))
	}
	
	return nil, fmt.Errorf("huggingface API failed after retries")
}

type voyageRequest struct {
	Input []string `json:"input"`
	Model string   `json:"model"`
}

type voyageResponse struct {
	Data []struct {
		Embedding []float32 `json:"embedding"`
	} `json:"data"`
}

func getVoyageEmbeddings(ctx context.Context, apiKey string, texts []string) ([][]float32, error) {
	url := "https://api.voyageai.com/v1/embeddings"
	
	reqBody, _ := json.Marshal(voyageRequest{
		Input: texts,
		Model: "voyage-code-2",
	})
	
	maxRetries := 5
	for attempt := 0; attempt < maxRetries; attempt++ {
		req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(reqBody))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+apiKey)
		req.Header.Set("Content-Type", "application/json")
		
		client := &http.Client{Timeout: 30 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
		
		bodyBytes, _ := io.ReadAll(resp.Body)
		
		if resp.StatusCode == 200 {
			var vResp voyageResponse
			if err := json.Unmarshal(bodyBytes, &vResp); err != nil {
				return nil, fmt.Errorf("failed to parse Voyage response: %w", err)
			}
			
			var embeddings [][]float32
			for _, d := range vResp.Data {
				embeddings = append(embeddings, d.Embedding)
			}
			return embeddings, nil
		}
		
		if resp.StatusCode == 429 {
			sleepTime := time.Duration(math.Pow(2, float64(attempt))) * time.Second * 5
			log.Printf("Voyage AI rate limit (status 429). Retrying in %v...", sleepTime)
			time.Sleep(sleepTime)
			continue
		}
		
		return nil, fmt.Errorf("voyage API error: status %d, body: %s", resp.StatusCode, string(bodyBytes))
	}
	
	return nil, fmt.Errorf("voyage API failed after retries")
}
