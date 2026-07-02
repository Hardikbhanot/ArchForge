package db

import (
	"testing"
	"time"

	"github.com/hardikbhanot/archforge/backend/internal/auth"
	"github.com/hardikbhanot/archforge/backend/internal/project"
)

func TestDatabaseIntegration(t *testing.T) {
	db, err := InitDB()
	if err != nil {
		t.Fatalf("failed to initialize database: %v", err)
	}
	defer db.Close()

	// 1. Test User Store Operations
	userStore := auth.NewPostgresUserStore(db)
	testUser := &auth.User{
		ID:                "test_pg_user_id",
		Username:          "pg_tester",
		Email:             "pg_tester@example.com",
		PasswordHash:      "hashed_pw",
		GithubAccessToken: "",
		CreatedAt:         time.Now(),
	}

	// Clean up from previous run if any
	_, _ = db.Exec("DELETE FROM users WHERE id = $1", testUser.ID)

	if err := userStore.Create(testUser); err != nil {
		t.Fatalf("failed to create user in postgres: %v", err)
	}

	fetched, err := userStore.GetByID(testUser.ID)
	if err != nil {
		t.Fatalf("failed to get user: %v", err)
	}
	if fetched.Username != testUser.Username {
		t.Errorf("expected username %s, got %s", testUser.Username, fetched.Username)
	}

	// Test unique constraints mapping
	err = userStore.Create(testUser)
	if err != auth.ErrUserAlreadyExists {
		t.Errorf("expected ErrUserAlreadyExists on duplicate key, got %v", err)
	}

	// 2. Test Project Store Operations & Cascade Deletion
	projStore := project.NewPostgresProjectStore(db)
	testProj := &project.Project{
		ID:         "test_pg_proj_id",
		Name:       "pg_project",
		GitURL:     "https://github.com/test/pg",
		LocalPath:  "/tmp/pg",
		Branch:     "main",
		CommitHash: "hash123",
		Status:     project.StatusCompleted,
		OwnerID:    testUser.ID,
		CreatedAt:  time.Now(),
	}

	if err := projStore.Create(testProj); err != nil {
		t.Fatalf("failed to create project: %v", err)
	}

	list, err := projStore.ListByOwner(testUser.ID)
	if err != nil {
		t.Fatalf("failed to list projects: %v", err)
	}
	if len(list) != 1 {
		t.Errorf("expected 1 project, got %d", len(list))
	}

	// Verify project status update
	err = projStore.UpdateStatus(testProj.ID, project.StatusParsed, "/tmp/pg_updated", "newhash", "")
	if err != nil {
		t.Fatalf("failed to update status: %v", err)
	}

	updated, _ := projStore.GetByID(testProj.ID)
	if updated.Status != project.StatusParsed || updated.CommitHash != "newhash" {
		t.Errorf("unexpected updated project state: %+v", updated)
	}

	// Verify manual project delete
	if err := projStore.Delete(testProj.ID); err != nil {
		t.Fatalf("failed to delete project: %v", err)
	}

	_, err = projStore.GetByID(testProj.ID)
	if err != project.ErrProjectNotFound {
		t.Errorf("expected ErrProjectNotFound, got %v", err)
	}

	// Clean up user
	_, _ = db.Exec("DELETE FROM users WHERE id = $1", testUser.ID)
}
