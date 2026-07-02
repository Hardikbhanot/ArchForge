package parser

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type GraphNode struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Kind      string `json:"kind"` // "package", "file", "symbol"
	FileCount int    `json:"file_count"`
}

type GraphEdge struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Type   string `json:"type"`
	Weight int    `json:"weight"`
}

type GraphResponse struct {
	Nodes []GraphNode `json:"nodes"`
	Edges []GraphEdge `json:"edges"`
}

type DocsResponse struct {
	Markdown string `json:"markdown"`
}

// ExtractPackage extracts the package/module prefix from a symbol ID, e.g. "go://internal/auth/UserStore" -> "internal/auth"
func ExtractPackage(symbolID string) string {
	parts := strings.Split(symbolID, "://")
	if len(parts) != 2 {
		return "main"
	}
	subParts := strings.Split(parts[1], "/")
	if len(subParts) <= 1 {
		return "main"
	}
	// Join all parts except the last one (which is the symbol name itself)
	return strings.Join(subParts[:len(subParts)-1], "/")
}

func CompileProjectGraph(irPath string) (*GraphResponse, error) {
	data, err := os.ReadFile(irPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read IR file: %w", err)
	}

	var ir ProjectIR
	if err := json.Unmarshal(data, &ir); err != nil {
		return nil, fmt.Errorf("failed to unmarshal IR: %w", err)
	}

	packageSet := make(map[string]bool)
	symbolPackageMap := make(map[string]string)
	packageFileCount := make(map[string]int)

	// Build a set of internal module names for fast lookup
	internalModules := make(map[string]bool)
	for _, m := range ir.Modules {
		internalModules[m] = true
		packageSet[m] = true
	}

	// Collect all packages from symbols and build symbol-to-package lookup map
	for _, sym := range ir.Symbols {
		pkg := ExtractPackage(sym.ID)
		packageSet[pkg] = true
		symbolPackageMap[sym.ID] = pkg
	}

	// Count files per package by directory
	for _, f := range ir.Files {
		dir := filepath.Dir(f.Path)
		// Normalize root-level files to the repo name or "main"
		if dir == "." {
			dir = "main"
		}
		// Map the directory path segment to an internal module if possible
		dirParts := strings.Split(dir, "/")
		pkg := dirParts[0]
		if len(dirParts) > 1 && !internalModules[dirParts[0]] {
			// use full directory as package name
			pkg = dir
		}
		packageFileCount[pkg]++
		packageSet[pkg] = true
	}

	// Create package nodes
	var nodes []GraphNode
	for pkg := range packageSet {
		nodes = append(nodes, GraphNode{
			ID:        pkg,
			Label:     pkg,
			Kind:      "package",
			FileCount: packageFileCount[pkg],
		})
	}

	// Sort nodes to be deterministic
	sort.Slice(nodes, func(i, j int) bool {
		return nodes[i].ID < nodes[j].ID
	})

	// Build package-to-package dependency edge count
	edgeWeights := make(map[string]int) // "sourcePkg->targetPkg" -> weight

	// 1. Derive edges from symbol-level relationships (if present)
	for _, rel := range ir.Relationships {
		srcPkg, srcOk := symbolPackageMap[rel.Source]
		tgtPkg, tgtOk := symbolPackageMap[rel.Target]

		if !srcOk {
			srcPkg = ExtractPackage(rel.Source)
		}
		if !tgtOk {
			tgtPkg = ExtractPackage(rel.Target)
		}

		// Only map package-level dependencies between DIFFERENT packages
		if srcPkg != tgtPkg {
			key := fmt.Sprintf("%s->%s", srcPkg, tgtPkg)
			edgeWeights[key]++
		}
	}

	// 2. Derive edges from file-level imports (catches repos with no symbol relationships)
	if len(edgeWeights) == 0 {
		for _, f := range ir.Files {
			// Determine the source package from the file's directory
			dir := filepath.Dir(f.Path)
			if dir == "." {
				dir = "main"
			}
			dirParts := strings.Split(dir, "/")
			srcPkg := dirParts[0]

			for _, imp := range f.Imports {
				// Match import path against known internal modules
				// e.g. import "github.com/go-playground/validator/v10/translations/en" -> target "en"
				for mod := range internalModules {
					if mod != srcPkg && (imp == mod || strings.HasSuffix(imp, "/"+mod)) {
						key := fmt.Sprintf("%s->%s", srcPkg, mod)
						edgeWeights[key]++
					}
				}
			}
		}
	}

	// Create package edges
	var edges []GraphEdge
	for key, weight := range edgeWeights {
		parts := strings.SplitN(key, "->", 2)
		if len(parts) == 2 {
			edges = append(edges, GraphEdge{
				Source: parts[0],
				Target: parts[1],
				Type:   "IMPORTS",
				Weight: weight,
			})
		}
	}

	// Sort edges to be deterministic
	sort.Slice(edges, func(i, j int) bool {
		if edges[i].Source == edges[j].Source {
			return edges[i].Target < edges[j].Target
		}
		return edges[i].Source < edges[j].Source
	})

	return &GraphResponse{
		Nodes: nodes,
		Edges: edges,
	}, nil
}

func GenerateSystemDocs(irPath string) (*DocsResponse, error) {
	data, err := os.ReadFile(irPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read IR file: %w", err)
	}

	var ir ProjectIR
	if err := json.Unmarshal(data, &ir); err != nil {
		return nil, fmt.Errorf("failed to unmarshal IR: %w", err)
	}

	var sb strings.Builder

	// Header & Metadata
	sb.WriteString(fmt.Sprintf("# Architecture Documentation for %s\n\n", ir.Name))
	sb.WriteString(fmt.Sprintf("> **Generated at:** %s  \n", time.Now().Format("2006-01-02 15:04:05 MST")))
	sb.WriteString(fmt.Sprintf("> **Platform Engine:** %s  \n", ir.Metadata.CreatedBy))
	sb.WriteString(fmt.Sprintf("> **Canonical IR Schema Version:** %s  \n\n", ir.SchemaVersion))

	sb.WriteString("## 1. System Overview\n")
	sb.WriteString(fmt.Sprintf("The system is built in **%s** and spans **%d modules/packages** comprising **%d source files** containing **%d symbols** and **%d relationships**.\n\n",
		ir.Language, len(ir.Modules), len(ir.Files), len(ir.Symbols), len(ir.Relationships)))

	// File listing
	sb.WriteString("## 2. Ingested Source Files\n")
	sb.WriteString("| Relative Path | Size (Bytes) | Package | Imports |\n")
	sb.WriteString("| --- | --- | --- | --- |\n")
	for _, f := range ir.Files {
		// Estimate package from first symbol or rel path
		pkgName := filepath.Dir(f.Path)
		if pkgName == "." {
			pkgName = "main"
		}
		sb.WriteString(fmt.Sprintf("| `%s` | %d | `%s` | %d |\n", f.Path, f.Size, pkgName, len(f.Imports)))
	}
	sb.WriteString("\n")

	// Package organization
	sb.WriteString("## 3. Package & Component Modules\n")
	packageSymbols := make(map[string][]Symbol)
	for _, sym := range ir.Symbols {
		pkg := ExtractPackage(sym.ID)
		packageSymbols[pkg] = append(packageSymbols[pkg], sym)
	}

	var sortedPkgs []string
	for pkg := range packageSymbols {
		sortedPkgs = append(sortedPkgs, pkg)
	}
	sort.Strings(sortedPkgs)

	for _, pkg := range sortedPkgs {
		syms := packageSymbols[pkg]
		sb.WriteString(fmt.Sprintf("### Package: `%s`\n", pkg))
		sb.WriteString(fmt.Sprintf("Contains **%d elements**.\n\n", len(syms)))

		// Sort symbols by kind and name
		sort.Slice(syms, func(i, j int) bool {
			if syms[i].Kind == syms[j].Kind {
				return syms[i].Name < syms[j].Name
			}
			return syms[i].Kind < syms[j].Kind
		})

		var structsList []string
		var interfacesList []string
		var funcsList []string

		for _, s := range syms {
			doc := s.Documentation
			if doc == "" {
				doc = "*No documentation comments.*"
			} else {
				doc = strings.TrimSpace(doc)
			}

			switch s.Kind {
			case "Struct", "Class":
				structsList = append(structsList, fmt.Sprintf("- **`struct %s`**: %s", s.Name, doc))
			case "Interface":
				interfacesList = append(interfacesList, fmt.Sprintf("- **`interface %s`**: %s", s.Name, doc))
			case "Function", "Method":
				funcsList = append(funcsList, fmt.Sprintf("- **`func %s%s`**: %s", s.Name, s.Signature, doc))
			}
		}

		if len(interfacesList) > 0 {
			sb.WriteString("#### Interfaces:\n")
			for _, line := range interfacesList {
				sb.WriteString(line + "\n")
			}
			sb.WriteString("\n")
		}

		if len(structsList) > 0 {
			sb.WriteString("#### Structures / Classes:\n")
			for _, line := range structsList {
				sb.WriteString(line + "\n")
			}
			sb.WriteString("\n")
		}

		if len(funcsList) > 0 {
			sb.WriteString("#### Functions & Methods:\n")
			for _, line := range funcsList {
				sb.WriteString(line + "\n")
			}
			sb.WriteString("\n")
		}
	}

	// Architectural Relationships
	sb.WriteString("## 4. Package Call Dependencies\n")
	sb.WriteString("Below are the high-level call relations extracted across package boundaries:\n\n")

	graph, err := CompileProjectGraph(irPath)
	if err == nil && len(graph.Edges) > 0 {
		sb.WriteString("| Source Package | Target Package | Connection Weight |\n")
		sb.WriteString("| --- | --- | --- |\n")
		for _, e := range graph.Edges {
			sb.WriteString(fmt.Sprintf("| `%s` | `→ %s` | %d call(s) |\n", e.Source, e.Target, e.Weight))
		}
	} else {
		sb.WriteString("*No inter-package call dependencies detected in this codebase.*")
	}
	sb.WriteString("\n")

	return &DocsResponse{
		Markdown: sb.String(),
	}, nil
}
