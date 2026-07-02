package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"

	"github.com/hardikbhanot/archforge/backend/internal/auth"
	"github.com/hardikbhanot/archforge/backend/internal/db"
	"github.com/hardikbhanot/archforge/backend/internal/parser"
	"github.com/hardikbhanot/archforge/backend/internal/project"
	"github.com/joho/godotenv"
)

type healthResponse struct {
	Status  string `json:"status"`
	Service string `json:"service"`
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:4200")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func newMux(database *sql.DB) http.Handler {
	mux := http.NewServeMux()

	// Initialize Auth structures (using Postgres)
	userStore := auth.NewPostgresUserStore(database)
	authHandler := auth.NewAuthHandler(userStore)
	githubHandler := auth.NewGithubHandler(userStore)

	// Initialize Project structures (using Postgres)
	projectStore := project.NewPostgresProjectStore(database)
	cloner := project.NewCloner(projectStore, "./data/repositories")
	projectHandler := project.NewProjectHandler(projectStore, cloner)

	// Initialize Parser structures
	parserManager := parser.NewParserManager()
	parserManager.RegisterAdapter(".go", parser.NewGoAdapter())
	parserService := parser.NewParserService(projectStore, parserManager, "./data/ir")
	parserHandler := parser.NewParserHandler(projectStore, parserService)

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

	// Auth Endpoints
	mux.HandleFunc("POST /api/v1/auth/register", authHandler.Register)
	mux.HandleFunc("POST /api/v1/auth/login", authHandler.Login)
	mux.Handle("GET /api/v1/auth/me", auth.AuthMiddleware(http.HandlerFunc(authHandler.Me)))
	mux.HandleFunc("GET /api/v1/auth/github/login", githubHandler.Login)
	mux.HandleFunc("GET /api/v1/auth/github/callback", githubHandler.Callback)
	mux.Handle("GET /api/v1/github/repos", auth.AuthMiddleware(http.HandlerFunc(githubHandler.GetGithubRepos)))

	// Project Endpoints
	mux.Handle("POST /api/v1/projects", auth.AuthMiddleware(http.HandlerFunc(projectHandler.Import)))
	mux.Handle("GET /api/v1/projects", auth.AuthMiddleware(http.HandlerFunc(projectHandler.List)))
	mux.Handle("GET /api/v1/projects/{id}", auth.AuthMiddleware(http.HandlerFunc(projectHandler.Get)))
	mux.Handle("DELETE /api/v1/projects/{id}", auth.AuthMiddleware(http.HandlerFunc(projectHandler.Delete)))

	// Parser Endpoints
	mux.Handle("POST /api/v1/projects/{id}/parse", auth.AuthMiddleware(http.HandlerFunc(parserHandler.Parse)))
	mux.Handle("GET /api/v1/projects/{id}/ir", auth.AuthMiddleware(http.HandlerFunc(parserHandler.GetIR)))
	mux.Handle("GET /api/v1/projects/{id}/graph", auth.AuthMiddleware(http.HandlerFunc(parserHandler.GetGraph)))
	mux.Handle("GET /api/v1/projects/{id}/docs", auth.AuthMiddleware(http.HandlerFunc(parserHandler.GetDocs)))

	return corsMiddleware(mux)
}

func main() {
	// Load environment variables from .env file
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, relying on system environment variables")
	}

	// Connect to PostgreSQL database
	database, err := db.InitDB()
	if err != nil {
		log.Fatalf("failed to initialize database: %v", err)
	}
	defer database.Close()

	log.Println("ArchForge API listening on :8080")
	if err := http.ListenAndServe(":8080", newMux(database)); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
