package parser

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/hardikbhanot/archforge/backend/internal/project"
)

func TestGoAdapter(t *testing.T) {
	// Setup temp directory
	tmpDir, err := os.MkdirTemp("", "parser-test")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create a dummy Go file
	src := `package math

// Calculator represents a basic arithmetic device.
type Calculator struct {
	Value int
}

// Add adds a value to the calculator.
func (c *Calculator) Add(v int) int {
	return c.Value + v
}

func Multiply(a, b int) int {
	return a * b
}
`
	fileName := "calc.go"
	filePath := filepath.Join(tmpDir, fileName)
	if err := os.WriteFile(filePath, []byte(src), 0644); err != nil {
		t.Fatalf("failed to write dummy go file: %v", err)
	}

	adapter := NewGoAdapter()
	fileIR, symbols, relationships, err := adapter.ParseFile(tmpDir, fileName)
	if err != nil {
		t.Fatalf("ParseFile failed: %v", err)
	}

	if fileIR == nil {
		t.Fatal("expected fileIR to be non-nil")
	}
	if fileIR.Language != "Go" {
		t.Errorf("expected language 'Go', got %s", fileIR.Language)
	}

	// Should extract Struct: Calculator, Method: Add, Function: Multiply
	if len(symbols) != 3 {
		t.Errorf("expected 3 symbols, got %d", len(symbols))
	}

	// Verify symbol names & types
	hasStruct := false
	hasMethod := false
	hasFunction := false

	for _, s := range symbols {
		switch s.Kind {
		case "Struct":
			if s.Name == "Calculator" {
				hasStruct = true
				if !strings.Contains(s.Documentation, "arithmetic device") {
					t.Errorf("expected struct docs, got %q", s.Documentation)
				}
			}
		case "Method":
			if s.Name == "Add" {
				hasMethod = true
				if s.Location.LineStart != 9 {
					t.Errorf("expected line 9 start for Add method, got %d", s.Location.LineStart)
				}
			}
		case "Function":
			if s.Name == "Multiply" {
				hasFunction = true
			}
		}
	}

	if !hasStruct || !hasMethod || !hasFunction {
		t.Errorf("missing expected symbols (Struct=%t, Method=%t, Function=%t)", hasStruct, hasMethod, hasFunction)
	}

	// Containment relationship: Struct Contains Method
	if len(relationships) != 1 {
		t.Errorf("expected 1 relationship, got %d", len(relationships))
	} else {
		rel := relationships[0]
		if rel.Type != "CONTAINS" {
			t.Errorf("expected type 'CONTAINS', got %s", rel.Type)
		}
		if rel.Source != "go://math/Calculator" || rel.Target != "go://math/Calculator/Add" {
			t.Errorf("unexpected relationship entities: Source=%s, Target=%s", rel.Source, rel.Target)
		}
	}
}

func TestParserService(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "service-test")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	repoDir := filepath.Join(tmpDir, "repo")
	irDir := filepath.Join(tmpDir, "ir")
	_ = os.MkdirAll(repoDir, 0755)

	// Create test file
	src := `package main
func main() {}
`
	if err := os.WriteFile(filepath.Join(repoDir, "main.go"), []byte(src), 0644); err != nil {
		t.Fatalf("failed to write file: %v", err)
	}

	store := project.NewInMemoryProjectStore()
	proj := &project.Project{
		ID:        "proj_123",
		Name:      "test-project",
		GitURL:    "https://github.com/user/test-project",
		LocalPath: repoDir,
		Status:    project.StatusCompleted,
		OwnerID:   "owner_1",
		CreatedAt: time.Now(),
	}
	_ = store.Create(proj)

	manager := NewParserManager()
	manager.RegisterAdapter(".go", NewGoAdapter())
	service := NewParserService(store, manager, irDir)

	// Trigger parsing
	service.ParseProject(proj)

	// Give the async go routine a brief window to complete
	time.Sleep(100 * time.Millisecond)

	updatedProj, _ := store.GetByID("proj_123")
	if updatedProj.Status != project.StatusParsed {
		t.Errorf("expected project status PARSED, got %s", updatedProj.Status)
	}

	// Verify IR output file was created
	irFilePath := filepath.Join(irDir, "proj_123.json")
	if _, err := os.Stat(irFilePath); os.IsNotExist(err) {
		t.Fatal("expected generated IR json file to exist")
	}

	// Decode IR file content
	fileBytes, _ := os.ReadFile(irFilePath)
	var ir ProjectIR
	if err := json.Unmarshal(fileBytes, &ir); err != nil {
		t.Fatalf("failed to parse IR json: %v", err)
	}

	if ir.Name != "test-project" {
		t.Errorf("expected project name 'test-project', got %s", ir.Name)
	}
	if len(ir.Files) != 1 {
		t.Errorf("expected 1 parsed file, got %d", len(ir.Files))
	}
	if ir.Files[0].Path != "main.go" {
		t.Errorf("expected file path 'main.go', got %s", ir.Files[0].Path)
	}
}
