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

// isNoisyDir returns true for directories that should be excluded from the graph:
// _examples, _test dirs, testdata, vendor, .git, etc.
func isNoisyDir(top string) bool {
	if top == "" {
		return true
	}
	// Exclude Go convention noise dirs
	if strings.HasPrefix(top, "_") || strings.HasPrefix(top, ".") {
		return true
	}
	switch top {
	case "testdata", "vendor", "third_party", "node_modules", "dist", "build", "hack":
		return true
	}
	return false
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

	// Root package label = project name (e.g. "gin", "cobra")
	rootLabel := ir.Name
	if rootLabel == "" {
		rootLabel = "main"
	}

	// ── 1. Count files per top-level directory (source of truth for nodes) ──
	fileCount := make(map[string]int) // topDir → count

	for _, f := range ir.Files {
		// Skip test files
		if strings.HasSuffix(f.Path, "_test.go") {
			continue
		}
		dir := filepath.Dir(f.Path)
		var top string
		if dir == "." {
			top = rootLabel // root-level files → project name
		} else {
			top = topLevelPkg(dir)
		}
		if isNoisyDir(top) {
			continue
		}
		fileCount[top]++
	}

	// If filtering left nothing, try again without test-file skip
	if len(fileCount) == 0 {
		for _, f := range ir.Files {
			dir := filepath.Dir(f.Path)
			var top string
			if dir == "." {
				top = rootLabel
			} else {
				top = topLevelPkg(dir)
			}
			if isNoisyDir(top) {
				continue
			}
			fileCount[top]++
		}
	}

	// ── 2. Sort by file count (desc) and cap at maxGraphNodes ────────────
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

	chosen := make(map[string]bool, len(ranked))
	for _, e := range ranked {
		chosen[e.name] = true
	}

	// ── 3. Create nodes ──────────────────────────────────────────────────
	var nodes []GraphNode
	for _, e := range ranked {
		nodes = append(nodes, GraphNode{
			ID:        e.name,
			Label:     e.name,
			Kind:      "package",
			FileCount: e.count,
		})
	}

	// ── 4. Build edges ───────────────────────────────────────────────────
	edgeWeights := make(map[string]int)

	// 4a. Symbol-level relationships
	for _, rel := range ir.Relationships {
		srcTop := topLevelPkg(ExtractPackage(rel.Source))
		tgtTop := topLevelPkg(ExtractPackage(rel.Target))
		if srcTop == tgtTop || !chosen[srcTop] || !chosen[tgtTop] {
			continue
		}
		edgeWeights[srcTop+"->"+tgtTop]++
	}

	// 4b. File-level import matching (fallback)
	if len(edgeWeights) == 0 {
		for _, f := range ir.Files {
			if strings.HasSuffix(f.Path, "_test.go") {
				continue
			}
			dir := filepath.Dir(f.Path)
			var srcTop string
			if dir == "." {
				srcTop = rootLabel
			} else {
				srcTop = topLevelPkg(dir)
			}
			if !chosen[srcTop] {
				continue
			}
			for _, imp := range f.Imports {
				// Walk import path segments right-to-left looking for a chosen package
				impParts := strings.Split(imp, "/")
				for i := len(impParts) - 1; i >= 0; i-- {
					tgt := impParts[i]
					if tgt != srcTop && chosen[tgt] {
						edgeWeights[srcTop+"->"+tgt]++
						break
					}
				}
			}
		}
	}

	// ── 5. Create edges ──────────────────────────────────────────────────
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

// CompileFileGraph returns a file-level graph for one top-level package.
// Nodes = .go source files in that package dir.
// Edges = file → sibling package that file imports (project-internal only).
func CompileFileGraph(irPath, targetPkg string) (*GraphResponse, error) {
	data, err := os.ReadFile(irPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read IR file: %w", err)
	}
	var ir ProjectIR
	if err := json.Unmarshal(data, &ir); err != nil {
		return nil, fmt.Errorf("failed to unmarshal IR: %w", err)
	}

	rootLabel := ir.Name
	if rootLabel == "" {
		rootLabel = "main"
	}

	// ── Collect all known top-level packages (for edge targets) ──────────
	knownPkgs := make(map[string]bool)
	for _, f := range ir.Files {
		if strings.HasSuffix(f.Path, "_test.go") {
			continue
		}
		dir := filepath.Dir(f.Path)
		var top string
		if dir == "." {
			top = rootLabel
		} else {
			top = topLevelPkg(dir)
		}
		if !isNoisyDir(top) {
			knownPkgs[top] = true
		}
	}

	// ── Collect files that belong to targetPkg ───────────────────────────
	type fileInfo struct {
		path    string
		label   string
		imports []string
	}
	var pkgFiles []fileInfo

	for _, f := range ir.Files {
		if strings.HasSuffix(f.Path, "_test.go") {
			continue
		}
		dir := filepath.Dir(f.Path)
		var top string
		if dir == "." {
			top = rootLabel
		} else {
			top = topLevelPkg(dir)
		}
		if top != targetPkg {
			continue
		}
		label := filepath.Base(f.Path) // e.g. "context.go"
		pkgFiles = append(pkgFiles, fileInfo{
			path:    f.Path,
			label:   label,
			imports: f.Imports,
		})
	}

	if len(pkgFiles) == 0 {
		return &GraphResponse{Nodes: []GraphNode{}, Edges: []GraphEdge{}}, nil
	}

	// Sort by name for determinism
	sort.Slice(pkgFiles, func(i, j int) bool {
		return pkgFiles[i].label < pkgFiles[j].label
	})

	// ── Build file nodes ─────────────────────────────────────────────────
	var nodes []GraphNode
	fileIDs := make(map[string]bool)
	for _, f := range pkgFiles {
		nodes = append(nodes, GraphNode{
			ID:    f.path,
			Label: f.label,
			Kind:  "file",
		})
		fileIDs[f.path] = true
	}

	// ── Build external package nodes & edges ─────────────────────────────
	// Only add edges to OTHER known project packages (not stdlib/third-party)
	extPkgSeen := make(map[string]bool)
	edgeWeights := make(map[string]int)

	for _, f := range pkgFiles {
		for _, imp := range f.imports {
			// Walk right-to-left to find a known project package
			parts := strings.Split(imp, "/")
			for i := len(parts) - 1; i >= 0; i-- {
				tgt := parts[i]
				if tgt != targetPkg && knownPkgs[tgt] {
					edgeWeights[f.path+"->"+tgt]++
					extPkgSeen[tgt] = true
					break
				}
			}
		}
	}

	// Add external package nodes (shown differently via kind="external")
	var extPkgs []string
	for p := range extPkgSeen {
		extPkgs = append(extPkgs, p)
	}
	sort.Strings(extPkgs)
	for _, p := range extPkgs {
		nodes = append(nodes, GraphNode{
			ID:    p,
			Label: p,
			Kind:  "external",
		})
	}

	// ── Create edges ─────────────────────────────────────────────────────
	var edges []GraphEdge
	for key, weight := range edgeWeights {
		ps := strings.SplitN(key, "->", 2)
		if len(ps) == 2 {
			edges = append(edges, GraphEdge{
				Source: ps[0],
				Target: ps[1],
				Type:   "IMPORTS",
				Weight: weight,
			})
		}
	}
	sort.Slice(edges, func(i, j int) bool {
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
