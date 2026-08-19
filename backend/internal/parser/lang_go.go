package parser

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io"
	"os"
	"path/filepath"
	"strings"
)

type GoAdapter struct{}

func NewGoAdapter() *GoAdapter {
	return &GoAdapter{}
}

func (a *GoAdapter) ParseFile(rootPath, relPath string) (*FileIR, []Symbol, []Relationship, error) {
	absPath := filepath.Join(rootPath, relPath)
	file, err := os.Open(absPath)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	// Get file size and calculate SHA-256 checksum
	stat, err := file.Stat()
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to stat file: %w", err)
	}

	hasher := sha256.New()
	if _, err := io.Copy(hasher, file); err != nil {
		return nil, nil, nil, fmt.Errorf("failed to hash file: %w", err)
	}
	checksum := hex.EncodeToString(hasher.Sum(nil))

	// Re-seek file for parsing
	_, _ = file.Seek(0, 0)
	
	content, err := os.ReadFile(absPath)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to read file: %w", err)
	}

	fset := token.NewFileSet()
	astFile, err := parser.ParseFile(fset, absPath, file, parser.ParseComments)
	if err != nil {
		// Return basic file metadata even if AST parsing fails
		fileIR := &FileIR{
			Path:     relPath,
			Checksum: checksum,
			Language: "Go",
			Size:     stat.Size(),
		}
		return fileIR, nil, nil, nil
	}

	pkgName := astFile.Name.Name

	// 1. Collect Imports
	var imports []string
	for _, imp := range astFile.Imports {
		if imp.Path != nil {
			imports = append(imports, strings.Trim(imp.Path.Value, "\""))
		}
	}

	fileIR := &FileIR{
		Path:     relPath,
		Checksum: checksum,
		Language: "Go",
		Size:     stat.Size(),
		Imports:  imports,
	}

	var symbols []Symbol
	var relationships []Relationship

	// Helper to extract position details
	getPosition := func(pos token.Pos) (int, int) {
		p := fset.Position(pos)
		return p.Line, p.Column
	}

	// 2. Traverse Declarations
	for _, decl := range astFile.Decls {
		switch d := decl.(type) {
		case *ast.GenDecl:
			// Handle type declarations (structs and interfaces)
			if d.Tok == token.TYPE {
				for _, spec := range d.Specs {
					ts, ok := spec.(*ast.TypeSpec)
					if !ok {
						continue
					}

					kind := "Type"
					var childIDs []string

					switch t := ts.Type.(type) {
					case *ast.StructType:
						kind = "Struct"
						// Extract field names
						if t.Fields != nil {
							for _, f := range t.Fields.List {
								for _, name := range f.Names {
									childIDs = append(childIDs, fmt.Sprintf("go://%s/%s.%s", pkgName, ts.Name.Name, name.Name))
								}
							}
						}
					case *ast.InterfaceType:
						kind = "Interface"
						// Extract method declarations
						if t.Methods != nil {
							for _, m := range t.Methods.List {
								for _, name := range m.Names {
									childIDs = append(childIDs, fmt.Sprintf("go://%s/%s/%s", pkgName, ts.Name.Name, name.Name))
								}
							}
						}
					}

					startLine, startCol := getPosition(ts.Pos())
					endLine, endCol := getPosition(ts.End())

					doc := ""
					if d.Doc != nil {
						doc = d.Doc.Text()
					}

					visibility := "private"
					if ast.IsExported(ts.Name.Name) {
						visibility = "public"
					}

					symbolID := fmt.Sprintf("go://%s/%s", pkgName, ts.Name.Name)
					
					startOffset := fset.Position(ts.Pos()).Offset
					endOffset := fset.Position(ts.End()).Offset
					codeSnippet := string(content[startOffset:endOffset])
					
					symbols = append(symbols, Symbol{
						ID:            symbolID,
						Name:          ts.Name.Name,
						Kind:          kind,
						QualifiedName: fmt.Sprintf("%s.%s", pkgName, ts.Name.Name),
						Visibility:    visibility,
						Location: Location{
							File:        relPath,
							LineStart:   startLine,
							LineEnd:     endLine,
							ColumnStart: startCol,
							ColumnEnd:   endCol,
						},
						Documentation: doc,
						CodeSnippet:   codeSnippet,
						Signature:     fmt.Sprintf("type %s %s", ts.Name.Name, kind),
						Children:      childIDs,
					})
				}
			}

		case *ast.FuncDecl:
			// Handle Functions and Methods
			kind := "Function"
			receiverStruct := ""
			var symbolID string
			var qName string

			// Check if it is a struct method
			if d.Recv != nil && len(d.Recv.List) > 0 {
				kind = "Method"
				recvType := d.Recv.List[0].Type
				// Handle pointer receiver types e.g., *StructName
				if star, ok := recvType.(*ast.StarExpr); ok {
					if ident, ok := star.X.(*ast.Ident); ok {
						receiverStruct = ident.Name
					}
				} else if ident, ok := recvType.(*ast.Ident); ok {
					receiverStruct = ident.Name
				}
			}

			if receiverStruct != "" {
				symbolID = fmt.Sprintf("go://%s/%s/%s", pkgName, receiverStruct, d.Name.Name)
				qName = fmt.Sprintf("%s.%s.%s", pkgName, receiverStruct, d.Name.Name)
			} else {
				symbolID = fmt.Sprintf("go://%s/%s", pkgName, d.Name.Name)
				qName = fmt.Sprintf("%s.%s", pkgName, d.Name.Name)
			}

			startLine, startCol := getPosition(d.Pos())
			endLine, endCol := getPosition(d.End())

			doc := ""
			if d.Doc != nil {
				doc = d.Doc.Text()
			}

			visibility := "private"
			if ast.IsExported(d.Name.Name) {
				visibility = "public"
			}

			signature := d.Name.Name
			if d.Type != nil {
				signature = fmt.Sprintf("func %s()", d.Name.Name) // simplified signature representation
			}

			startOffset := fset.Position(d.Pos()).Offset
			endOffset := fset.Position(d.End()).Offset
			codeSnippet := string(content[startOffset:endOffset])

			symbols = append(symbols, Symbol{
				ID:            symbolID,
				Name:          d.Name.Name,
				Kind:          kind,
				QualifiedName: qName,
				Visibility:    visibility,
				Location: Location{
					File:        relPath,
					LineStart:   startLine,
					LineEnd:     endLine,
					ColumnStart: startCol,
					ColumnEnd:   endCol,
				},
				Documentation: doc,
				CodeSnippet:   codeSnippet,
				Signature:     signature,
			})

			// Add relationship for method -> struct containment
			if receiverStruct != "" {
				structID := fmt.Sprintf("go://%s/%s", pkgName, receiverStruct)
				relationships = append(relationships, Relationship{
					Source:     structID,
					Target:     symbolID,
					Type:       "CONTAINS",
					Weight:     1,
					Confidence: 1.0,
				})
			}

			// 3. Inspect Function Body for basic Call Relationships (CALLS)
			if d.Body != nil {
				ast.Inspect(d.Body, func(n ast.Node) bool {
					call, ok := n.(*ast.CallExpr)
					if !ok {
						return true
					}

					var targetID string
					switch fun := call.Fun.(type) {
					case *ast.Ident:
						// Call to local function in the package
						targetID = fmt.Sprintf("go://%s/%s", pkgName, fun.Name)
					case *ast.SelectorExpr:
						// Call to selector expression like package.Function or object.Method
						if ident, ok := fun.X.(*ast.Ident); ok {
							// Check if the selector is a package call or struct method
							// E.g., auth.GenerateToken
							targetID = fmt.Sprintf("go://%s/%s", ident.Name, fun.Sel.Name)
						}
					}

					if targetID != "" {
						relationships = append(relationships, Relationship{
							Source:     symbolID,
							Target:     targetID,
							Type:       "CALLS",
							Weight:     1,
							Confidence: 0.9,
						})
					}
					return true
				})
			}
		}
	}

	return fileIR, symbols, relationships, nil
}
