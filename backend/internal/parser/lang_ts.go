package parser

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	sitter "github.com/smacker/go-tree-sitter"
	"github.com/smacker/go-tree-sitter/typescript/typescript"
)

type TSAdapter struct{}

func NewTSAdapter() *TSAdapter {
	return &TSAdapter{}
}

func (a *TSAdapter) ParseFile(rootPath, relPath string) (*FileIR, []Symbol, []Relationship, error) {
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
	parser.SetLanguage(typescript.GetLanguage())

	tree, err := parser.ParseCtx(context.Background(), nil, content)
	if err != nil {
		fileIR := &FileIR{
			Path:     relPath,
			Checksum: checksum,
			Language: "TypeScript",
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
		if node.Type() == "import_statement" {
			// Extract import path
			for i := 0; i < int(node.ChildCount()); i++ {
				child := node.Child(i)
				if child.Type() == "string" {
					importPath := strings.Trim(child.Content(content), "\"'")
					imports = append(imports, importPath)
				}
			}
		} else if node.Type() == "class_declaration" || node.Type() == "interface_declaration" || node.Type() == "function_declaration" {
			var nameNode *sitter.Node
			for i := 0; i < int(node.ChildCount()); i++ {
				if node.Child(i).Type() == "identifier" || node.Child(i).Type() == "type_identifier" {
					nameNode = node.Child(i)
					break
				}
			}

			if nameNode != nil {
				name := nameNode.Content(content)
				kind := "Class"
				if node.Type() == "interface_declaration" {
					kind = "Interface"
				} else if node.Type() == "function_declaration" {
					kind = "Function"
				}

				id := fmt.Sprintf("ts://%s/%s", pkgName, name)
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
		Language: "TypeScript",
		Size:     stat.Size(),
		Imports:  imports,
	}

	return fileIR, symbols, relationships, nil
}
