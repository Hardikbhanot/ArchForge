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
	"github.com/smacker/go-tree-sitter/typescript/tsx"
	"github.com/smacker/go-tree-sitter/typescript/typescript"
)

type TSAdapter struct {
	isTSX bool
}

func NewTSAdapter() *TSAdapter {
	return &TSAdapter{isTSX: false}
}

func NewTSXAdapter() *TSAdapter {
	return &TSAdapter{isTSX: true}
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
	if a.isTSX {
		parser.SetLanguage(tsx.GetLanguage())
	} else {
		parser.SetLanguage(typescript.GetLanguage())
	}

	tree, err := parser.ParseCtx(context.Background(), nil, content)
	if err != nil {
		fileIR := &FileIR{
			Path:     relPath,
			Checksum: checksum,
			Language: "TypeScript",
			Size:     stat.Size(),
		}
		if a.isTSX {
			fileIR.Language = "TSX"
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
		} else if node.Type() == "class_declaration" || node.Type() == "interface_declaration" || node.Type() == "function_declaration" || node.Type() == "method_definition" {
			var nameNode *sitter.Node
			for i := 0; i < int(node.ChildCount()); i++ {
				if node.Child(i).Type() == "identifier" || node.Child(i).Type() == "type_identifier" || node.Child(i).Type() == "property_identifier" {
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
				} else if node.Type() == "method_definition" {
					kind = "Method"
				}

				id := fmt.Sprintf("ts://%s/%s", pkgName, name)
				symbols = append(symbols, Symbol{
					ID:            id,
					Name:          name,
					Kind:          kind,
					Location:      Location{File: relPath, LineStart: int(node.StartPoint().Row + 1), LineEnd: int(node.EndPoint().Row + 1)},
					Documentation: "",
					CodeSnippet:   node.Content(content),
					Metadata:      map[string]interface{}{},
				})
			}
		} else if node.Type() == "lexical_declaration" || node.Type() == "variable_declaration" {
			// Handle React arrow function components: const MyComp = () => {}
			for i := 0; i < int(node.ChildCount()); i++ {
				decl := node.Child(i)
				if decl.Type() == "variable_declarator" {
					var nameNode, valueNode *sitter.Node
					for j := 0; j < int(decl.ChildCount()); j++ {
						child := decl.Child(j)
						if child.Type() == "identifier" {
							nameNode = child
						} else if child.Type() == "arrow_function" {
							valueNode = child
						}
					}
					
					if nameNode != nil && valueNode != nil {
						name := nameNode.Content(content)
						id := fmt.Sprintf("ts://%s/%s", pkgName, name)
						symbols = append(symbols, Symbol{
							ID:            id,
							Name:          name,
							Kind:          "Function", // Arrow functions are treated as Functions/Components
							Location:      Location{File: relPath, LineStart: int(node.StartPoint().Row + 1), LineEnd: int(node.EndPoint().Row + 1)},
							Documentation: "",
							CodeSnippet:   node.Content(content),
							Metadata:      map[string]interface{}{},
						})
					}
				}
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
