package parser

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	sitter "github.com/smacker/go-tree-sitter"
	"github.com/smacker/go-tree-sitter/cpp"
)

type CppAdapter struct{}

func NewCppAdapter() *CppAdapter {
	return &CppAdapter{}
}

func (a *CppAdapter) ParseFile(rootPath, relPath string) (*FileIR, []Symbol, []Relationship, error) {
	absPath := filepath.Join(rootPath, relPath)
	content, err := os.ReadFile(absPath)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to read file: %w", err)
	}

	parser := sitter.NewParser()
	parser.SetLanguage(cpp.GetLanguage())

	tree, err := parser.ParseCtx(context.Background(), nil, content)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to parse cpp file: %w", err)
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
		if node.Type() == "preproc_include" {
			for i := 0; i < int(node.ChildCount()); i++ {
				if node.Child(i).Type() == "string_literal" || node.Child(i).Type() == "system_lib_string" {
					fileIR.Imports = append(fileIR.Imports, node.Child(i).Content(content))
				}
			}
		} else if node.Type() == "class_specifier" || node.Type() == "struct_specifier" {
			var nameNode *sitter.Node
			for i := 0; i < int(node.ChildCount()); i++ {
				if node.Child(i).Type() == "type_identifier" || node.Child(i).Type() == "identifier" {
					nameNode = node.Child(i)
					break
				}
			}

			if nameNode != nil {
				name := nameNode.Content(content)
				kind := "Class"
				if node.Type() == "struct_specifier" {
					kind = "Struct"
				}

				id := fmt.Sprintf("cpp://%s/%s", pkgName, name)
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
		} else if node.Type() == "function_definition" {
			var nameNode *sitter.Node
			var functionDeclarator *sitter.Node
			
			for i := 0; i < int(node.ChildCount()); i++ {
				if node.Child(i).Type() == "function_declarator" {
					functionDeclarator = node.Child(i)
					break
				}
			}

			if functionDeclarator != nil {
				for i := 0; i < int(functionDeclarator.ChildCount()); i++ {
					if functionDeclarator.Child(i).Type() == "identifier" || functionDeclarator.Child(i).Type() == "field_identifier" || functionDeclarator.Child(i).Type() == "qualified_identifier" {
						nameNode = functionDeclarator.Child(i)
						break
					}
				}
			}

			if nameNode != nil {
				name := nameNode.Content(content)
				
				id := fmt.Sprintf("cpp://%s/%s", pkgName, name)
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
