package project

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/hardikbhanot/archforge/backend/internal/utils"
)

type Cloner struct {
	Store   ProjectStore
	DataDir string
}

func NewCloner(store ProjectStore, dataDir string) *Cloner {
	return &Cloner{
		Store:   store,
		DataDir: dataDir,
	}
}

func (c *Cloner) StartClone(p *Project) {
	// Transition status to CLONING
	err := c.Store.UpdateStatus(p.ID, StatusCloning, "", "", "")
	if err != nil {
		log.Printf("Cloner: failed to update status to CLONING for project %s: %v", p.ID, err)
		return
	}

	go func() {
		repoHash := utils.GenerateRepoHash(p.GitURL, p.Branch)
		localPath := filepath.Join(c.DataDir, repoHash)
		p.LocalPath = localPath

		// Ensure parent directory exists
		if err := os.MkdirAll(c.DataDir, 0755); err != nil {
			_ = c.Store.UpdateStatus(p.ID, StatusFailed, "", "", fmt.Sprintf("failed to create data dir: %v", err))
			return
		}

		// Check if it's already cloned
		if stat, err := os.Stat(localPath); err == nil && stat.IsDir() {
			log.Printf("Cloner: repository already exists at %s, skipping clone for project %s", localPath, p.ID)
			_ = c.Store.UpdateStatus(p.ID, StatusCompleted, localPath, p.Branch, "")
			return
		}

		// Remove existing directory to prevent git clone collisions
		_ = os.RemoveAll(localPath)

		// Formulate git clone arguments
		args := []string{"clone", "--depth", "1"}
		if p.Branch != "" {
			args = append(args, "--branch", p.Branch)
		}
		args = append(args, p.GitURL, localPath)

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()

		cmd := exec.CommandContext(ctx, "git", args...)
		var stderr bytes.Buffer
		cmd.Stderr = &stderr

		if err := cmd.Run(); err != nil {
			errMsg := fmt.Sprintf("git clone failed: %v, stderr: %s", err, stderr.String())
			log.Printf("Cloner: %s", errMsg)
			_ = c.Store.UpdateStatus(p.ID, StatusFailed, "", "", errMsg)
			return
		}

		// Extract HEAD commit hash
		hashCmd := exec.CommandContext(ctx, "git", "rev-parse", "HEAD")
		hashCmd.Dir = localPath
		var hashOut bytes.Buffer
		var hashErr bytes.Buffer
		hashCmd.Stdout = &hashOut
		hashCmd.Stderr = &hashErr

		commitHash := ""
		if err := hashCmd.Run(); err == nil {
			commitHash = strings.TrimSpace(hashOut.String())
		} else {
			log.Printf("Cloner: failed to get commit hash: %v, stderr: %s", err, hashErr.String())
		}

		// Update to COMPLETED
		_ = c.Store.UpdateStatus(p.ID, StatusCompleted, localPath, commitHash, "")
		log.Printf("Cloner: successfully cloned project %s (%s)", p.ID, p.GitURL)
	}()
}
