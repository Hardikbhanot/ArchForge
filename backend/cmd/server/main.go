package main

import (
	"encoding/json"
	"log"
	"net/http"
)

type healthResponse struct {
	Status  string `json:"status"`
	Service string `json:"service"`
}

func newMux() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(healthResponse{
			Status:  "ok",
			Service: "archforge-api",
		})
	})

	mux.HandleFunc("/api/v1/overview", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"name":        "ArchForge",
			"stack":       "Go + Angular",
			"mvp":         []string{"repository ingestion", "hybrid retrieval", "ai chat", "architecture visualization"},
			"status":      "mvp scaffold",
			"description": "AI-native software architecture intelligence platform",
		})
	})

	return mux
}

func main() {
	log.Println("ArchForge API listening on :8080")
	if err := http.ListenAndServe(":8080", newMux()); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
