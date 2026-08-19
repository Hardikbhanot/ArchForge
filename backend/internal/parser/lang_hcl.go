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

type HCLAdapter struct{}

func NewHCLAdapter() *HCLAdapter {
	return &HCLAdapter{}
}

func (a *HCLAdapter) ParseFile(rootPath, relPath string) (*FileIR, []Symbol, []Relationship, error) {
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
		Language: "Terraform",
		Size:     stat.Size(),
	}

	var symbols []Symbol
	var relationships []Relationship

	lines := strings.Split(content, "\n")

	// Terraform block detection: resource "aws_instance" "web" {
	blockRegex := regexp.MustCompile(`^([a-z]+)\s+"([^"]+)"\s+"([^"]+)"\s*\{`)
	moduleRegex := regexp.MustCompile(`^module\s+"([^"]+)"\s*\{`)

	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		
		if matches := blockRegex.FindStringSubmatch(trimmed); len(matches) > 0 {
			blockType := matches[1] // resource, data, provider
			resourceType := matches[2] // aws_instance
			name := matches[3] // web

			symbols = append(symbols, Symbol{
				ID:            fmt.Sprintf("tf://%s/%s/%s/%s", relPath, blockType, resourceType, name),
				Name:          name,
				Kind:          "TF_" + strings.Title(blockType),
				QualifiedName: fmt.Sprintf("%s.%s", resourceType, name),
				Visibility:    "public",
				Location: Location{
					File:      relPath,
					LineStart: i + 1,
					LineEnd:   i + 1,
				},
				CodeSnippet: line,
				Signature:   fmt.Sprintf("%s %s", blockType, resourceType),
			})
		} else if matches := moduleRegex.FindStringSubmatch(trimmed); len(matches) > 0 {
			name := matches[1]

			symbols = append(symbols, Symbol{
				ID:            fmt.Sprintf("tf://%s/module/%s", relPath, name),
				Name:          name,
				Kind:          "TF_Module",
				QualifiedName: name,
				Visibility:    "public",
				Location: Location{
					File:      relPath,
					LineStart: i + 1,
					LineEnd:   i + 1,
				},
				CodeSnippet: line,
				Signature:   "module " + name,
			})
		}
	}

	return fileIR, symbols, relationships, nil
}
