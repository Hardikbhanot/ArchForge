package parser

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestGraphAndDocsGeneration(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "graph-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	mockIR := ProjectIR{
		SchemaVersion: "1.0.0",
		Name:          "TestProject",
		Version:       "1.0.0",
		Language:      "Go",
		Repository:    "https://github.com/test/project",
		Modules:       []string{"internal/auth", "internal/db"},
		Files: []FileIR{
			{
				Path:     "internal/auth/user.go",
				Language: "Go",
				Size:     256,
				Imports:  []string{"internal/db"},
			},
		},
		Symbols: []Symbol{
			{
				ID:            "go://internal/auth/UserStore",
				Name:          "UserStore",
				Kind:          "Interface",
				Documentation: "Interface for user database operations",
			},
			{
				ID:            "go://internal/db/PostgresDB",
				Name:          "PostgresDB",
				Kind:          "Struct",
				Documentation: "PostgreSQL client struct representation",
			},
		},
		Relationships: []Relationship{
			{
				Source: "go://internal/auth/UserStore",
				Target: "go://internal/db/PostgresDB",
				Type:   "CALLS",
			},
		},
		Metadata: Metadata{
			CreatedBy:   "TestParser",
			GeneratedAt: time.Now(),
		},
	}

	irPath := filepath.Join(tempDir, "test_project.json")
	irFile, err := os.Create(irPath)
	if err != nil {
		t.Fatalf("failed to create temp IR file: %v", err)
	}

	encoder := json.NewEncoder(irFile)
	if err := encoder.Encode(mockIR); err != nil {
		irFile.Close()
		t.Fatalf("failed to encode IR: %v", err)
	}
	irFile.Close()

	// 1. Test ExtractPackage helper
	pkg1 := ExtractPackage("go://internal/auth/UserStore")
	if pkg1 != "internal/auth" {
		t.Errorf("expected package internal/auth, got %s", pkg1)
	}

	pkg2 := ExtractPackage("go://main")
	if pkg2 != "main" {
		t.Errorf("expected package main, got %s", pkg2)
	}

	// 2. Test CompileProjectGraph
	graph, err := CompileProjectGraph(irPath)
	if err != nil {
		t.Fatalf("CompileProjectGraph failed: %v", err)
	}

	if len(graph.Nodes) != 2 {
		t.Errorf("expected 2 graph nodes, got %d", len(graph.Nodes))
	}

	// Verify nodes
	nodeLabels := make(map[string]bool)
	for _, n := range graph.Nodes {
		nodeLabels[n.Label] = true
	}
	if !nodeLabels["internal/auth"] || !nodeLabels["internal/db"] {
		t.Errorf("expected internal/auth and internal/db package labels, got: %v", nodeLabels)
	}

	// Verify edge
	if len(graph.Edges) != 1 {
		t.Errorf("expected 1 edge between packages, got %d", len(graph.Edges))
	} else {
		edge := graph.Edges[0]
		if edge.Source != "internal/auth" || edge.Target != "internal/db" {
			t.Errorf("expected edge internal/auth -> internal/db, got %s -> %s", edge.Source, edge.Target)
		}
	}

	// 3. Test GenerateSystemDocs
	docs, err := GenerateSystemDocs(irPath)
	if err != nil {
		t.Fatalf("GenerateSystemDocs failed: %v", err)
	}

	if !strings.Contains(docs.Markdown, "# Architecture Documentation for TestProject") {
		t.Errorf("markdown does not contain expected header title")
	}

	if !strings.Contains(docs.Markdown, "internal/auth/user.go") {
		t.Errorf("markdown does not contain expected source file listings")
	}

	if !strings.Contains(docs.Markdown, "PostgresDB") {
		t.Errorf("markdown does not contain expected symbol records")
	}
}
