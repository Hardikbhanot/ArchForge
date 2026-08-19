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

type DockerAdapter struct{}

func NewDockerAdapter() *DockerAdapter {
	return &DockerAdapter{}
}

func (a *DockerAdapter) ParseFile(rootPath, relPath string) (*FileIR, []Symbol, []Relationship, error) {
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
		Language: "Dockerfile",
		Size:     stat.Size(),
	}

	var symbols []Symbol
	var relationships []Relationship

	lines := strings.Split(content, "\n")
	
	fromRegex := regexp.MustCompile(`^FROM\s+([^\s]+)(?:\s+AS\s+([^\s]+))?`)
	exposeRegex := regexp.MustCompile(`^EXPOSE\s+([0-9]+)`)
	cmdRegex := regexp.MustCompile(`^(?:CMD|ENTRYPOINT)\s+(.+)`)

	for i, line := range lines {
		line = strings.TrimSpace(line)
		
		if matches := fromRegex.FindStringSubmatch(line); len(matches) > 0 {
			image := matches[1]
			alias := ""
			if len(matches) > 2 && matches[2] != "" {
				alias = matches[2]
			}
			
			name := alias
			if name == "" {
				name = "BaseImage"
			}

			symbols = append(symbols, Symbol{
				ID:            fmt.Sprintf("docker://%s/FROM/%s", relPath, name),
				Name:          name,
				Kind:          "ContainerImage",
				QualifiedName: image,
				Visibility:    "public",
				Location: Location{
					File:      relPath,
					LineStart: i + 1,
					LineEnd:   i + 1,
				},
				CodeSnippet: line,
				Signature:   image,
			})
		} else if matches := exposeRegex.FindStringSubmatch(line); len(matches) > 0 {
			port := matches[1]
			symbols = append(symbols, Symbol{
				ID:            fmt.Sprintf("docker://%s/EXPOSE/%s", relPath, port),
				Name:          port,
				Kind:          "NetworkPort",
				QualifiedName: port,
				Visibility:    "public",
				Location: Location{
					File:      relPath,
					LineStart: i + 1,
					LineEnd:   i + 1,
				},
				CodeSnippet: line,
				Signature:   "EXPOSE " + port,
			})
		} else if matches := cmdRegex.FindStringSubmatch(line); len(matches) > 0 {
			cmd := matches[1]
			symbols = append(symbols, Symbol{
				ID:            fmt.Sprintf("docker://%s/CMD", relPath),
				Name:          "Entrypoint",
				Kind:          "Process",
				QualifiedName: cmd,
				Visibility:    "public",
				Location: Location{
					File:      relPath,
					LineStart: i + 1,
					LineEnd:   i + 1,
				},
				CodeSnippet: line,
				Signature:   cmd,
			})
		}
	}

	return fileIR, symbols, relationships, nil
}
