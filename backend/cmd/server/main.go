package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"

	"github.com/hardikbhanot/archforge/backend/internal/ai"
	"github.com/hardikbhanot/archforge/backend/internal/auth"
	"github.com/hardikbhanot/archforge/backend/internal/db"
	"github.com/hardikbhanot/archforge/backend/internal/parser"
	"github.com/hardikbhanot/archforge/backend/internal/project"
	"github.com/hardikbhanot/archforge/backend/internal/webhook"
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
	parserManager.RegisterAdapter(".ts", parser.NewTSAdapter())
	parserManager.RegisterAdapter(".tsx", parser.NewTSXAdapter())
	parserManager.RegisterAdapter(".js", parser.NewJSAdapter())
	parserManager.RegisterAdapter(".jsx", parser.NewJSAdapter())
	parserManager.RegisterAdapter(".py", parser.NewPythonAdapter())
	parserManager.RegisterAdapter(".java", parser.NewJavaAdapter())
	parserManager.RegisterAdapter(".cpp", parser.NewCppAdapter())
	parserManager.RegisterAdapter(".hpp", parser.NewCppAdapter())
	parserManager.RegisterAdapter(".cc", parser.NewCppAdapter())
	parserManager.RegisterAdapter(".rs", parser.NewRustAdapter())
	parserManager.RegisterAdapter(".cs", parser.NewCSharpAdapter())
	parserManager.RegisterAdapter("Dockerfile", parser.NewDockerAdapter())
	parserManager.RegisterAdapter(".yaml", parser.NewYAMLAdapter())
	parserManager.RegisterAdapter(".yml", parser.NewYAMLAdapter())
	parserManager.RegisterAdapter(".tf", parser.NewHCLAdapter())
	parserService := parser.NewParserService(projectStore, parserManager, "./data/ir")
	parserHandler := parser.NewParserHandler(projectStore, parserService)

	// Initialize AI Service
	apiKey := os.Getenv("GEMINI_API_KEY")
	hfAPIKey := os.Getenv("HUGGINGFACE_API_KEY")
	voyageAPIKey := os.Getenv("VOYAGE_API_KEY")
	
	var aiHandler *ai.AIHandler
	if apiKey != "" {
		aiService, err := ai.NewAIService(apiKey, hfAPIKey, voyageAPIKey, "./data/embeddings")
		if err != nil {
			log.Printf("Failed to initialize AI Service: %v", err)
		} else {
			aiHandler = ai.NewAIHandler(aiService, "./data/ir", projectStore)
		}
	} else {
		log.Println("GEMINI_API_KEY not set. AI Chat feature will be disabled.")
	}

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

	// AI Endpoints
	if aiHandler != nil {
		mux.Handle("POST /api/v1/projects/{id}/chat", auth.AuthMiddleware(http.HandlerFunc(aiHandler.HandleChat)))
		mux.Handle("GET /api/v1/projects/{id}/hld", auth.AuthMiddleware(http.HandlerFunc(aiHandler.HandleGenerateHLD)))
		mux.HandleFunc("POST /api/v1/extension/chat", aiHandler.HandleExtensionChat)
	}

	// Initialize Webhook Handler
	whHandler, err := webhook.NewWebhookHandler()
	if err != nil {
		log.Printf("Failed to initialize Webhook Handler: %v", err)
	}

	// Parser Endpoints
	mux.Handle("POST /api/v1/projects/{id}/parse", auth.AuthMiddleware(http.HandlerFunc(parserHandler.Parse)))
	mux.Handle("GET /api/v1/projects/{id}/ir", auth.AuthMiddleware(http.HandlerFunc(parserHandler.GetIR)))
	mux.Handle("GET /api/v1/projects/{id}/graph", auth.AuthMiddleware(http.HandlerFunc(parserHandler.GetGraph)))
	mux.Handle("GET /api/v1/projects/{id}/docs", auth.AuthMiddleware(http.HandlerFunc(parserHandler.GetDocs)))

	// Webhook Endpoints
	if whHandler != nil {
		mux.HandleFunc("POST /api/v1/webhooks/github", whHandler.HandleGitHubEvent)
	}

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
