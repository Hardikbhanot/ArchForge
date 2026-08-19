package webhook

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/hardikbhanot/archforge/backend/internal/ai"
	"github.com/hardikbhanot/archforge/backend/internal/github"
)

// WebhookPayload represents the basic structure of a GitHub Webhook event.
type WebhookPayload struct {
	Action      string `json:"action"`
	PullRequest struct {
		Number int `json:"number"`
	} `json:"pull_request"`
	Repository struct {
		FullName string `json:"full_name"`
	} `json:"repository"`
}

type WebhookHandler struct {
	githubClient *github.Client
	reviewer     *ai.PRReviewer
}

func NewWebhookHandler() (*WebhookHandler, error) {
	geminiKey := os.Getenv("GEMINI_API_KEY")
	reviewer, err := ai.NewPRReviewer(geminiKey)
	if err != nil {
		return nil, fmt.Errorf("failed to init PR reviewer: %w", err)
	}

	return &WebhookHandler{
		githubClient: github.NewClient(),
		reviewer:     reviewer,
	}, nil
}

func (h *WebhookHandler) HandleGitHubEvent(w http.ResponseWriter, r *http.Request) {
	event := r.Header.Get("X-GitHub-Event")

	if event != "pull_request" {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Ignored non-PR event"))
		return
	}

	var payload WebhookPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid JSON payload", http.StatusBadRequest)
		return
	}

	// We only care when a PR is opened or new commits are pushed (synchronize).
	if payload.Action != "opened" && payload.Action != "synchronize" {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Ignored PR action: " + payload.Action))
		return
	}

	// Process the PR asynchronously to avoid blocking the webhook response.
	go h.processPullRequest(payload.Repository.FullName, payload.PullRequest.Number)

	w.WriteHeader(http.StatusAccepted)
	w.Write([]byte("Processing PR review..."))
}

func (h *WebhookHandler) processPullRequest(repoFullName string, prNumber int) {
	log.Printf("[Webhook] Starting PR review for %s #%d", repoFullName, prNumber)
	
	// 1. Fetch the diff
	diff, err := h.githubClient.FetchPRDiff(repoFullName, prNumber)
	if err != nil {
		log.Printf("[Webhook] Error fetching diff for %s #%d: %v", repoFullName, prNumber, err)
		return
	}

	if len(diff) > 50000 {
		diff = diff[:50000] // Truncate to prevent context window explosion
	}

	// 2. Analyze with AI
	ctx := context.Background()
	review, err := h.reviewer.ReviewPRDiff(ctx, repoFullName, prNumber, diff)
	if err != nil {
		log.Printf("[Webhook] Error reviewing diff for %s #%d: %v", repoFullName, prNumber, err)
		return
	}

	// 3. Post comment
	header := "## 🤖 ArchForge PR Architecture Review\n\n"
	fullComment := header + review

	err = h.githubClient.PostComment(repoFullName, prNumber, fullComment)
	if err != nil {
		log.Printf("[Webhook] Error posting comment for %s #%d: %v", repoFullName, prNumber, err)
		return
	}

	log.Printf("[Webhook] Successfully reviewed and commented on %s #%d", repoFullName, prNumber)
}
