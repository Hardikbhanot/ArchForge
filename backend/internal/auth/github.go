package auth

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type GithubHandler struct {
	Store UserStore
}

func NewGithubHandler(store UserStore) *GithubHandler {
	return &GithubHandler{Store: store}
}

type githubUserResponse struct {
	Login string `json:"login"`
	Email string `json:"email"`
	ID    int    `json:"id"`
}

type githubTokenResponse struct {
	AccessToken string `json:"access_token"`
	Scope       string `json:"scope"`
	TokenType   string `json:"token_type"`
	Error       string `json:"error"`
}

func (h *GithubHandler) getCredentials() (string, string, bool) {
	clientID := os.Getenv("GITHUB_CLIENT_ID")
	clientSecret := os.Getenv("GITHUB_CLIENT_SECRET")
	if clientID == "" || clientSecret == "" {
		return "", "", false
	}
	return clientID, clientSecret, true
}

func (h *GithubHandler) Login(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	clientID, _, ok := h.getCredentials()
	if !ok {
		// Mock redirect
		mockRedirect := "http://localhost:4200/auth/github/callback?code=mock_dev_code"
		_ = json.NewEncoder(w).Encode(map[string]string{
			"url":  mockRedirect,
			"mode": "mock",
		})
		return
	}

	redirectURI := "http://localhost:4200/auth/github/callback"
	githubURL := fmt.Sprintf(
		"https://github.com/login/oauth/authorize?client_id=%s&redirect_uri=%s&scope=user:email,repo",
		url.QueryEscape(clientID),
		url.QueryEscape(redirectURI),
	)

	_ = json.NewEncoder(w).Encode(map[string]string{
		"url":  githubURL,
		"mode": "production",
	})
}

func (h *GithubHandler) Callback(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	code := r.URL.Query().Get("code")
	if code == "" {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "missing auth code"})
		return
	}

	var username string
	var email string
	var githubToken string

	clientID, clientSecret, ok := h.getCredentials()
	if !ok || strings.HasPrefix(code, "mock_") {
		// Mock execution
		username = "github_mock_dev"
		email = "mock_dev@github.com"
		githubToken = "mock_github_access_token"
	} else {
		// Exchange code for token
		tokenReqBody, _ := json.Marshal(map[string]string{
			"client_id":     clientID,
			"client_secret": clientSecret,
			"code":          code,
		})

		req, err := http.NewRequest(http.MethodPost, "https://github.com/login/oauth/access_token", bytes.NewBuffer(tokenReqBody))
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(errorResponse{Error: "failed to build token exchange request"})
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(errorResponse{Error: "failed to contact github oauth server"})
			return
		}
		defer resp.Body.Close()

		var tokenResp githubTokenResponse
		if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
			log.Printf("Failed to decode token response: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(errorResponse{Error: "failed to decode github token response"})
			return
		}

		if tokenResp.Error != "" {
			log.Printf("GitHub OAuth Error: %s", tokenResp.Error)
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(errorResponse{Error: tokenResp.Error})
			return
		}

		githubToken = tokenResp.AccessToken

		// Fetch User Profile
		profileReq, _ := http.NewRequest(http.MethodGet, "https://api.github.com/user", nil)
		profileReq.Header.Set("Authorization", "Bearer "+tokenResp.AccessToken)
		profileReq.Header.Set("Accept", "application/json")

		profileResp, err := http.DefaultClient.Do(profileReq)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(errorResponse{Error: "failed to fetch user profile"})
			return
		}
		defer profileResp.Body.Close()

		var profile githubUserResponse
		profileBytes, _ := io.ReadAll(profileResp.Body)
		if err := json.Unmarshal(profileBytes, &profile); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(errorResponse{Error: "failed to parse user profile"})
			return
		}

		username = profile.Login
		email = profile.Email
		if email == "" {
			// GitHub sometimes returns empty email if not public, use fallback
			email = fmt.Sprintf("%s@users.noreply.github.com", username)
		}
	}

	// Create/Find User record
	user, err := h.Store.GetByEmail(email)
	if err != nil {
		// Register new OAuth User
		user = &User{
			ID:                generateID(),
			Username:          username,
			Email:             email,
			PasswordHash:      "oauth-managed-user",
			GithubAccessToken: githubToken,
			CreatedAt:         time.Now(),
		}
		if err := h.Store.Create(user); err != nil {
			// If username already taken, add randomized suffix
			user.Username = fmt.Sprintf("%s_%s", username, generateID()[:6])
			_ = h.Store.Create(user)
		}
	} else {
		// Update access token for existing user
		_ = h.Store.UpdateGithubToken(user.ID, githubToken)
	}

	token, err := GenerateToken(user.ID, user.Username)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(errorResponse{Error: "failed to issue authentication token"})
		return
	}

	_ = json.NewEncoder(w).Encode(authResponse{
		Token: token,
		User:  user,
	})
}
