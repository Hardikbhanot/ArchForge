package project

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/hardikbhanot/archforge/backend/internal/auth"
)

func TestProjectStore(t *testing.T) {
	store := NewInMemoryProjectStore()
	p := &Project{
		ID:        "p-1",
		Name:      "test-repo",
		GitURL:    "https://github.com/test/test-repo.git",
		Status:    StatusPending,
		OwnerID:   "user-123",
		CreatedAt: time.Now(),
	}

	if err := store.Create(p); err != nil {
		t.Fatalf("failed to create project: %v", err)
	}

	retrieved, err := store.GetByID("p-1")
	if err != nil {
		t.Fatalf("failed to get project: %v", err)
	}

	if retrieved.Name != "test-repo" {
		t.Errorf("expected test-repo, got %s", retrieved.Name)
	}

	list, err := store.ListByOwner("user-123")
	if err != nil {
		t.Fatalf("failed to list projects: %v", err)
	}

	if len(list) != 1 {
		t.Errorf("expected list length 1, got %d", len(list))
	}

	err = store.UpdateStatus("p-1", StatusCompleted, "commit-hash-abc", "")
	if err != nil {
		t.Fatalf("failed to update status: %v", err)
	}

	updated, _ := store.GetByID("p-1")
	if updated.Status != StatusCompleted || updated.CommitHash != "commit-hash-abc" {
		t.Errorf("status update failed: %+v", updated)
	}
}

func TestProjectHandlers(t *testing.T) {
	store := NewInMemoryProjectStore()
	cloner := NewCloner(store, "./test-data/repositories")
	handler := NewProjectHandler(store, cloner)

	// Test Import Handler
	reqBody := importRequest{
		GitURL: "https://github.com/octocat/Spoon-Knife.git",
		Branch: "main",
	}
	bodyBytes, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/projects", bytes.NewBuffer(bodyBytes))
	rec := httptest.NewRecorder()

	// Inject claims into context manually to simulate middleware success
	ctx := context.WithValue(req.Context(), auth.UserIDKey, "user-123")
	ctx = context.WithValue(ctx, auth.UsernameKey, "testuser")
	req = req.WithContext(ctx)

	handler.Import(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d. Body: %s", rec.Code, rec.Body.String())
	}

	var p Project
	if err := json.NewDecoder(rec.Body).Decode(&p); err != nil {
		t.Fatalf("failed to decode project response: %v", err)
	}

	if p.Name != "Spoon-Knife" {
		t.Errorf("expected Spoon-Knife, got %s", p.Name)
	}

	if p.Status != StatusPending && p.Status != StatusCloning {
		t.Errorf("unexpected initial status: %s", p.Status)
	}

	// Clean up after test cloner goroutine triggers (it runs asynchronously, so let's allow it to fail on the invalid local path context, but we will clean up the directory)
	time.Sleep(100 * time.Millisecond)
	_ = os.RemoveAll("./test-data")
}

func TestRepoNameInference(t *testing.T) {
	tests := []struct {
		url      string
		expected string
	}{
		{"https://github.com/octocat/Spoon-Knife.git", "Spoon-Knife"},
		{"https://github.com/octocat/Spoon-Knife", "Spoon-Knife"},
		{"git@github.com:octocat/Spoon-Knife.git", "Spoon-Knife"},
		{"invalid-url", "unknown-repository"},
	}

	for _, tc := range tests {
		res := getRepoName(tc.url)
		if res != tc.expected {
			t.Errorf("for url %s expected %s, got %s", tc.url, tc.expected, res)
		}
	}
}
