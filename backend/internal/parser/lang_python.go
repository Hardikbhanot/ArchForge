package parser

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"

	sitter "github.com/smacker/go-tree-sitter"
	"github.com/smacker/go-tree-sitter/python"
)

type PythonAdapter struct{}

func NewPythonAdapter() *PythonAdapter {
	return &PythonAdapter{}
}

func (a *PythonAdapter) ParseFile(rootPath, relPath string) (*FileIR, []Symbol, []Relationship, error) {
	absPath := filepath.Join(rootPath, relPath)
	file, err := os.Open(absPath)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to stat file: %w", err)
	}

	hasher := sha256.New()
	if _, err := io.Copy(hasher, file); err != nil {
		return nil, nil, nil, fmt.Errorf("failed to hash file: %w", err)
	}
	checksum := hex.EncodeToString(hasher.Sum(nil))

	content, err := os.ReadFile(absPath)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to read file: %w", err)
	}

	parser := sitter.NewParser()
	parser.SetLanguage(python.GetLanguage())

	tree, err := parser.ParseCtx(context.Background(), nil, content)
	if err != nil {
		fileIR := &FileIR{
			Path:     relPath,
			Checksum: checksum,
			Language: "Python",
			Size:     stat.Size(),
		}
		return fileIR, nil, nil, nil
	}

	var imports []string
	var symbols []Symbol
	var relationships []Relationship

	pkgName := filepath.Base(filepath.Dir(absPath))
	if pkgName == "." || pkgName == "/" {
		pkgName = "root"
	}

	var walk func(node *sitter.Node)
	walk = func(node *sitter.Node) {
		if node.Type() == "import_statement" || node.Type() == "import_from_statement" {
			for i := 0; i < int(node.ChildCount()); i++ {
				child := node.Child(i)
				if child.Type() == "dotted_name" {
					importPath := child.Content(content)
					imports = append(imports, importPath)
				}
			}
		} else if node.Type() == "class_definition" || node.Type() == "function_definition" {
			var nameNode *sitter.Node
			for i := 0; i < int(node.ChildCount()); i++ {
				if node.Child(i).Type() == "identifier" {
					nameNode = node.Child(i)
					break
				}
			}

			if nameNode != nil {
				name := nameNode.Content(content)
				kind := "Class"
				if node.Type() == "function_definition" {
					kind = "Function"
				}

				id := fmt.Sprintf("python://%s/%s", pkgName, name)
				symbols = append(symbols, Symbol{
					ID:            id,
					Name:          name,
					Kind:          kind,
					Location:      Location{File: relPath, LineStart: int(node.StartPoint().Row + 1), LineEnd: int(node.EndPoint().Row + 1)},
					Documentation: "",
					Metadata:      map[string]interface{}{},
				})
			}
		}

		for i := 0; i < int(node.ChildCount()); i++ {
			walk(node.Child(i))
		}
	}

	walk(tree.RootNode())

	fileIR := &FileIR{
		Path:     relPath,
		Checksum: checksum,
		Language: "Python",
		Size:     stat.Size(),
		Imports:  imports,
	}

	return fileIR, symbols, relationships, nil
}
