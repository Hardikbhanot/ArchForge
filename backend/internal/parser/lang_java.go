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
	"github.com/smacker/go-tree-sitter/java"
)

type JavaAdapter struct{}

func NewJavaAdapter() *JavaAdapter {
	return &JavaAdapter{}
}

func (a *JavaAdapter) ParseFile(rootPath, relPath string) (*FileIR, []Symbol, []Relationship, error) {
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
	parser.SetLanguage(java.GetLanguage())

	tree, err := parser.ParseCtx(context.Background(), nil, content)
	if err != nil {
		fileIR := &FileIR{
			Path:     relPath,
			Checksum: checksum,
			Language: "Java",
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
		if node.Type() == "import_declaration" {
			for i := 0; i < int(node.ChildCount()); i++ {
				child := node.Child(i)
				if child.Type() == "scoped_identifier" || child.Type() == "identifier" {
					importPath := child.Content(content)
					imports = append(imports, importPath)
				}
			}
		} else if node.Type() == "class_declaration" || node.Type() == "interface_declaration" {
			var nameNode *sitter.Node
			var annotations []string

			for i := 0; i < int(node.ChildCount()); i++ {
				child := node.Child(i)
				if child.Type() == "identifier" {
					nameNode = child
				} else if child.Type() == "modifiers" {
					for j := 0; j < int(child.ChildCount()); j++ {
						mod := child.Child(j)
						if mod.Type() == "marker_annotation" || mod.Type() == "annotation" {
							annotations = append(annotations, mod.Content(content))
						}
					}
				}
			}

			if nameNode != nil {
				name := nameNode.Content(content)
				kind := "Class"
				if node.Type() == "interface_declaration" {
					kind = "Interface"
				}

				meta := map[string]interface{}{}
				if len(annotations) > 0 {
					meta["annotations"] = annotations
				}

				id := fmt.Sprintf("java://%s/%s", pkgName, name)
				symbols = append(symbols, Symbol{
					ID:            id,
					Name:          name,
					Kind:          kind,
					Location:      Location{File: relPath, LineStart: int(node.StartPoint().Row + 1), LineEnd: int(node.EndPoint().Row + 1)},
					Documentation: "",
					CodeSnippet:   node.Content(content),
					Metadata:      meta,
				})
			}
		} else if node.Type() == "method_declaration" || node.Type() == "constructor_declaration" {
			var nameNode *sitter.Node
			for i := 0; i < int(node.ChildCount()); i++ {
				if node.Child(i).Type() == "identifier" {
					nameNode = node.Child(i)
					break
				}
			}

			if nameNode != nil {
				name := nameNode.Content(content)
				kind := "Method"
				if node.Type() == "constructor_declaration" {
					kind = "Constructor"
				}

				id := fmt.Sprintf("java://%s/%s", pkgName, name)
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
		}

		for i := 0; i < int(node.ChildCount()); i++ {
			walk(node.Child(i))
		}
	}

	walk(tree.RootNode())

	fileIR := &FileIR{
		Path:     relPath,
		Checksum: checksum,
		Language: "Java",
		Size:     stat.Size(),
		Imports:  imports,
	}

	return fileIR, symbols, relationships, nil
}
