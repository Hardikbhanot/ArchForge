package parser

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	sitter "github.com/smacker/go-tree-sitter"
	"github.com/smacker/go-tree-sitter/rust"
)

type RustAdapter struct{}

func NewRustAdapter() *RustAdapter {
	return &RustAdapter{}
}

func (a *RustAdapter) ParseFile(rootPath, relPath string) (*FileIR, []Symbol, []Relationship, error) {
	absPath := filepath.Join(rootPath, relPath)
	content, err := os.ReadFile(absPath)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to read file: %w", err)
	}

	parser := sitter.NewParser()
	parser.SetLanguage(rust.GetLanguage())

	tree, err := parser.ParseCtx(context.Background(), nil, content)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to parse rust file: %w", err)
	}

	pkgName := filepath.Dir(relPath)
	fileIR := &FileIR{
		Path:    relPath,
		Imports: []string{},
	}

	var symbols []Symbol
	var relationships []Relationship

	var traverse func(node *sitter.Node)
	traverse = func(node *sitter.Node) {
		if node.Type() == "use_declaration" {
			fileIR.Imports = append(fileIR.Imports, node.Content(content))
		} else if node.Type() == "struct_item" || node.Type() == "enum_item" || node.Type() == "trait_item" {
			var nameNode *sitter.Node
			for i := 0; i < int(node.ChildCount()); i++ {
				if node.Child(i).Type() == "type_identifier" {
					nameNode = node.Child(i)
					break
				}
			}

			if nameNode != nil {
				name := nameNode.Content(content)
				kind := "Struct"
				if node.Type() == "enum_item" {
					kind = "Enum"
				} else if node.Type() == "trait_item" {
					kind = "Interface"
				}

				id := fmt.Sprintf("rs://%s/%s", pkgName, name)
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
		} else if node.Type() == "function_item" {
			var nameNode *sitter.Node
			
			for i := 0; i < int(node.ChildCount()); i++ {
				if node.Child(i).Type() == "identifier" {
					nameNode = node.Child(i)
					break
				}
			}

			if nameNode != nil {
				name := nameNode.Content(content)
				
				id := fmt.Sprintf("rs://%s/%s", pkgName, name)
				symbols = append(symbols, Symbol{
					ID:            id,
					Name:          name,
					Kind:          "Function",
					Location:      Location{File: relPath, LineStart: int(node.StartPoint().Row + 1), LineEnd: int(node.EndPoint().Row + 1)},
					Documentation: "",
					CodeSnippet:   node.Content(content),
					Metadata:      map[string]interface{}{},
				})
			}
		}

		for i := 0; i < int(node.ChildCount()); i++ {
			traverse(node.Child(i))
		}
	}

	traverse(tree.RootNode())

	return fileIR, symbols, relationships, nil
}
