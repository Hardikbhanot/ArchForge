package parser

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	sitter "github.com/smacker/go-tree-sitter"
	"github.com/smacker/go-tree-sitter/javascript"
)

type JSAdapter struct{}

func NewJSAdapter() *JSAdapter {
	return &JSAdapter{}
}

func (a *JSAdapter) ParseFile(rootPath, relPath string) (*FileIR, []Symbol, []Relationship, error) {
	absPath := filepath.Join(rootPath, relPath)
	content, err := os.ReadFile(absPath)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to read file: %w", err)
	}

	parser := sitter.NewParser()
	parser.SetLanguage(javascript.GetLanguage())

	tree, err := parser.ParseCtx(context.Background(), nil, content)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to parse js file: %w", err)
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
		if node.Type() == "import_statement" {
			for i := 0; i < int(node.ChildCount()); i++ {
				if node.Child(i).Type() == "string" {
					importPath := node.Child(i).Content(content)
					fileIR.Imports = append(fileIR.Imports, importPath)
				}
			}
		} else if node.Type() == "class_declaration" || node.Type() == "function_declaration" || node.Type() == "method_definition" {
			var nameNode *sitter.Node
			for i := 0; i < int(node.ChildCount()); i++ {
				if node.Child(i).Type() == "identifier" || node.Child(i).Type() == "property_identifier" {
					nameNode = node.Child(i)
					break
				}
			}

			if nameNode != nil {
				name := nameNode.Content(content)
				kind := "Class"
				if node.Type() == "function_declaration" {
					kind = "Function"
				} else if node.Type() == "method_definition" {
					kind = "Method"
				}

				id := fmt.Sprintf("js://%s/%s", pkgName, name)
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
						id := fmt.Sprintf("js://%s/%s", pkgName, name)
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
			}
		}

		for i := 0; i < int(node.ChildCount()); i++ {
			traverse(node.Child(i))
		}
	}

	traverse(tree.RootNode())

	return fileIR, symbols, relationships, nil
}
