package parser

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type YAMLAdapter struct{}

func NewYAMLAdapter() *YAMLAdapter {
	return &YAMLAdapter{}
}

func (a *YAMLAdapter) ParseFile(rootPath, relPath string) (*FileIR, []Symbol, []Relationship, error) {
	absPath := filepath.Join(rootPath, relPath)
	file, err := os.Open(absPath)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	stat, _ := file.Stat()
	hasher := sha256.New()
	io.Copy(hasher, file)
	checksum := hex.EncodeToString(hasher.Sum(nil))

	contentBytes, _ := os.ReadFile(absPath)
	content := string(contentBytes)

	fileIR := &FileIR{
		Path:     relPath,
		Checksum: checksum,
		Language: "YAML",
		Size:     stat.Size(),
	}

	var symbols []Symbol
	var relationships []Relationship

	lines := strings.Split(content, "\n")

	// Basic K8s/Compose detection regex
	kindRegex := regexp.MustCompile(`^kind:\s*([A-Za-z]+)`)
	nameRegex := regexp.MustCompile(`^\s*name:\s*([A-Za-z0-9_-]+)`)
	imageRegex := regexp.MustCompile(`^\s*image:\s*(.+)`)

	var currentKind string
	var currentService string

	for i, line := range lines {
		// Remove comments
		if idx := strings.Index(line, "#"); idx != -1 {
			line = line[:idx]
		}
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}

		if matches := kindRegex.FindStringSubmatch(trimmed); len(matches) > 0 {
			currentKind = matches[1]
		}

		if matches := nameRegex.FindStringSubmatch(trimmed); len(matches) > 0 {
			name := matches[1]
			if currentKind != "" {
				symbols = append(symbols, Symbol{
					ID:            fmt.Sprintf("k8s://%s/%s/%s", relPath, currentKind, name),
					Name:          name,
					Kind:          "K8s_" + currentKind,
					QualifiedName: name,
					Visibility:    "public",
					Location: Location{
						File:      relPath,
						LineStart: i + 1,
						LineEnd:   i + 1,
					},
					CodeSnippet: line,
					Signature:   "kind: " + currentKind,
				})
				currentKind = "" // Reset after processing the name
			}
		}

		// Docker compose services rough detection
		if strings.HasPrefix(line, "  ") && !strings.HasPrefix(line, "   ") && strings.HasSuffix(line, ":") {
			currentService = strings.Trim(line, " :")
			if currentService != "volumes" && currentService != "networks" && currentService != "environment" && currentService != "ports" && currentService != "depends_on" {
				symbols = append(symbols, Symbol{
					ID:            fmt.Sprintf("compose://%s/Service/%s", relPath, currentService),
					Name:          currentService,
					Kind:          "ComposeService",
					QualifiedName: currentService,
					Visibility:    "public",
					Location: Location{
						File:      relPath,
						LineStart: i + 1,
						LineEnd:   i + 1,
					},
					CodeSnippet: line,
					Signature:   "service: " + currentService,
				})
			}
		}

		if matches := imageRegex.FindStringSubmatch(line); len(matches) > 0 {
			image := matches[1]
			parent := currentService
			if parent == "" {
				parent = "Global"
			}
			
			symbolID := fmt.Sprintf("yaml://%s/Image/%s", relPath, image)
			symbols = append(symbols, Symbol{
				ID:            symbolID,
				Name:          image,
				Kind:          "ContainerImage",
				QualifiedName: image,
				Visibility:    "public",
				Location: Location{
					File:      relPath,
					LineStart: i + 1,
					LineEnd:   i + 1,
				},
				CodeSnippet: line,
				Signature:   "image: " + image,
			})
			
			if currentService != "" {
				relationships = append(relationships, Relationship{
					Source:     fmt.Sprintf("compose://%s/Service/%s", relPath, currentService),
					Target:     symbolID,
					Type:       "USES_IMAGE",
					Weight:     1,
					Confidence: 1.0,
				})
			}
		}
	}

	return fileIR, symbols, relationships, nil
}
