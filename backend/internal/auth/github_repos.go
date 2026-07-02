package auth

import (
	"encoding/json"
	"net/http"
	"time"
)

type GithubRepo struct {
	Name          string `json:"name"`
	FullName      string `json:"full_name"`
	Description   string `json:"description"`
	HTMLURL       string `json:"html_url"`
	DefaultBranch string `json:"default_branch"`
	Language      string `json:"language"`
}

func (h *GithubHandler) GetGithubRepos(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "method not allowed"})
		return
	}

	userID, _, ok := UserFromContext(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "unauthorized"})
		return
	}

	user, err := h.Store.GetByID(userID)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "user not found"})
		return
	}

	if user.GithubAccessToken == "" {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "GitHub account not connected"})
		return
	}

	// If in mock mode, return mock repositories
	if user.GithubAccessToken == "mock_github_access_token" {
		mockRepos := []GithubRepo{
			{
				Name:          "Spoon-Knife",
				FullName:      "octocat/Spoon-Knife",
				Description:   "This repo is for demonstration purposes only.",
				HTMLURL:       "https://github.com/octocat/Spoon-Knife.git",
				DefaultBranch: "main",
				Language:      "HTML",
			},
			{
				Name:          "TradeFlow",
				FullName:      "Hardikbhanot/TradeFlow",
				Description:   "Trading flow logic engine with metrics, state, and reports.",
				HTMLURL:       "https://github.com/Hardikbhanot/TradeFlow.git",
				DefaultBranch: "main",
				Language:      "Go",
			},
			{
				Name:          "ArchForge",
				FullName:      "Hardikbhanot/ArchForge",
				Description:   "AI-native software architecture intelligence platform.",
				HTMLURL:       "https://github.com/Hardikbhanot/ArchForge.git",
				DefaultBranch: "main",
				Language:      "Go",
			},
		}
		_ = json.NewEncoder(w).Encode(mockRepos)
		return
	}

	// Fetch repositories from real GitHub API
	req, err := http.NewRequest(http.MethodGet, "https://api.github.com/user/repos?visibility=public&affiliation=owner&sort=updated&per_page=100", nil)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "failed to build request to github api"})
		return
	}

	req.Header.Set("Authorization", "Bearer "+user.GithubAccessToken)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "failed to fetch repos from github"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		w.WriteHeader(resp.StatusCode)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "github api returned error status"})
		return
	}

	var ghRepos []struct {
		Name          string `json:"name"`
		FullName      string `json:"full_name"`
		Description   string `json:"description"`
		HTMLURL       string `json:"html_url"`
		DefaultBranch string `json:"default_branch"`
		Language      string `json:"language"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&ghRepos); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "failed to decode github repos list"})
		return
	}

	repos := make([]GithubRepo, len(ghRepos))
	for i, r := range ghRepos {
		repos[i] = GithubRepo{
			Name:          r.Name,
			FullName:      r.FullName,
			Description:   r.Description,
			HTMLURL:       r.HTMLURL,
			DefaultBranch: r.DefaultBranch,
			Language:      r.Language,
		}
	}

	_ = json.NewEncoder(w).Encode(repos)
}
