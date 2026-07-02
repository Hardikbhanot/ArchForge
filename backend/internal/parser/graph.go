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

const maxGraphNodes = 50

// topLevelPkg collapses a full path to its first meaningful segment.
// "translations/en" → "translations", "main" → "main", "cmd/server" → "cmd"
func topLevelPkg(path string) string {
	if path == "" || path == "." {
		return "main"
	}
	parts := strings.SplitN(path, "/", 2)
	return parts[0]
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

	// ── 1. Collect top-level package names and count files per package ──────
	fileCount := make(map[string]int) // topPkg → count

	for _, f := range ir.Files {
		dir := filepath.Dir(f.Path)
		if dir == "." {
			dir = "main"
		}
		pkg := topLevelPkg(dir)
		fileCount[pkg]++
	}

	// Also seed from module list (catches packages with no files listed)
	for _, m := range ir.Modules {
		top := topLevelPkg(m)
		if _, ok := fileCount[top]; !ok {
			fileCount[top] = 0
		}
	}
	// And from symbols
	for _, sym := range ir.Symbols {
		raw := ExtractPackage(sym.ID)
		top := topLevelPkg(raw)
		if _, ok := fileCount[top]; !ok {
			fileCount[top] = 0
		}
	}

	// ── 2. Sort packages by file count (desc) and cap at maxGraphNodes ───────
	type pkgEntry struct {
		name  string
		count int
	}
	var ranked []pkgEntry
	for name, cnt := range fileCount {
		ranked = append(ranked, pkgEntry{name, cnt})
	}
	sort.Slice(ranked, func(i, j int) bool {
		if ranked[i].count != ranked[j].count {
			return ranked[i].count > ranked[j].count
		}
		return ranked[i].name < ranked[j].name
	})
	if len(ranked) > maxGraphNodes {
		ranked = ranked[:maxGraphNodes]
	}

	// Build fast membership set for the chosen packages
	chosen := make(map[string]bool, len(ranked))
	for _, e := range ranked {
		chosen[e.name] = true
	}

	// Create nodes
	var nodes []GraphNode
	for _, e := range ranked {
		nodes = append(nodes, GraphNode{
			ID:        e.name,
			Label:     e.name,
			Kind:      "package",
			FileCount: e.count,
		})
	}

	// ── 3. Build edges (top-level → top-level, skip self-loops) ────────────
	edgeWeights := make(map[string]int)

	// 3a. Symbol-level relationships
	for _, rel := range ir.Relationships {
		srcTop := topLevelPkg(ExtractPackage(rel.Source))
		tgtTop := topLevelPkg(ExtractPackage(rel.Target))
		if srcTop != tgtTop && chosen[srcTop] && chosen[tgtTop] {
			edgeWeights[srcTop+"->"+tgtTop]++
		}
	}

	// 3b. File-level imports (fallback when relationships are absent)
	if len(edgeWeights) == 0 {
		// Build set of internal module top-levels for matching
		internalTops := make(map[string]bool)
		for _, m := range ir.Modules {
			internalTops[topLevelPkg(m)] = true
		}
		for name := range fileCount {
			internalTops[topLevelPkg(name)] = true
		}

		for _, f := range ir.Files {
			dir := filepath.Dir(f.Path)
			if dir == "." {
				dir = "main"
			}
			srcTop := topLevelPkg(dir)
			if !chosen[srcTop] {
				continue
			}
			for _, imp := range f.Imports {
				// Match the last segment of the import path against known top-level packages
				impParts := strings.Split(imp, "/")
				for i := len(impParts) - 1; i >= 0; i-- {
					tgtTop := impParts[i]
					if tgtTop != srcTop && chosen[tgtTop] && internalTops[tgtTop] {
						edgeWeights[srcTop+"->"+tgtTop]++
						break
					}
				}
			}
		}
	}

	// Create edges (only keep weight ≥ 1)
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

	sort.Slice(edges, func(i, j int) bool {
		if edges[i].Source == edges[j].Source {
			return edges[i].Target < edges[j].Target
		}
		return edges[i].Source < edges[j].Source
	})

	return &GraphResponse{Nodes: nodes, Edges: edges}, nil
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
