package utils

import (
	"crypto/md5"
	"encoding/hex"
	"strings"
)

// GenerateRepoHash creates a deterministic unique hash for a specific branch of a Git repository.
// This allows deduplication of cloned files, parsed IR, and generated AI embeddings.
func GenerateRepoHash(gitURL, branch string) string {
	if branch == "" {
		branch = "main"
	}
	
	// Normalize the URL to prevent slight variations (e.g. trailing slashes, .git suffix)
	normalizedURL := strings.TrimSpace(gitURL)
	normalizedURL = strings.TrimSuffix(normalizedURL, "/")
	normalizedURL = strings.TrimSuffix(normalizedURL, ".git")
	
	data := normalizedURL + "@" + strings.TrimSpace(branch)
	
	hash := md5.Sum([]byte(data))
	return hex.EncodeToString(hash[:])
}
