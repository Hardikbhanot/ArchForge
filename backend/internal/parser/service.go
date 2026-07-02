package parser

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/hardikbhanot/archforge/backend/internal/project"
)

type ParserService struct {
	ProjStore project.ProjectStore
	Manager   *ParserManager
	OutputDir string
}

func NewParserService(projStore project.ProjectStore, manager *ParserManager, outputDir string) *ParserService {
	return &ParserService{
		ProjStore: projStore,
		Manager:   manager,
		OutputDir: outputDir,
	}
}

func (s *ParserService) ParseProject(proj *project.Project) {
	// Transition status to PARSING
	err := s.ProjStore.UpdateStatus(proj.ID, project.StatusParsing, "", "")
	if err != nil {
		log.Printf("ParserService: failed to update status to PARSING for project %s: %v", proj.ID, err)
		return
	}

	go func() {
		log.Printf("ParserService: starting parse task on directory: %s", proj.LocalPath)

		var files []FileIR
		var symbols []Symbol
		var relationships []Relationship
		moduleMap := make(map[string]bool)

		// Check if local path exists
		if _, err := os.Stat(proj.LocalPath); os.IsNotExist(err) {
			errMsg := fmt.Sprintf("repository path not found: %s", proj.LocalPath)
			log.Printf("ParserService: %s", errMsg)
			_ = s.ProjStore.UpdateStatus(proj.ID, project.StatusFailed, "", errMsg)
			return
		}

		err := filepath.WalkDir(proj.LocalPath, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}

			// Ignore standard VCS and dependency folders
			if d.IsDir() {
				name := d.Name()
				if name == ".git" || name == "node_modules" || name == "vendor" || name == "test-data" {
					return filepath.SkipDir
				}
				return nil
			}

			relPath, err := filepath.Rel(proj.LocalPath, path)
			if err != nil {
				return nil
			}

			// Attempt parsing the file using manager adapters
			fileIR, fileSyms, fileRels, err := s.Manager.DetectAndParse(proj.LocalPath, relPath)
			if err != nil {
				log.Printf("ParserService: warning: failed to parse %s: %v", relPath, err)
				return nil
			}

			if fileIR != nil {
				files = append(files, *fileIR)

				// Extract module namespace from package naming in Go
				// go://payment/PaymentService -> Module package: payment
				for _, sym := range fileSyms {
					symbols = append(symbols, sym)
					if sym.Kind == "Struct" || sym.Kind == "Interface" || sym.Kind == "Function" {
						parts := strings.Split(sym.ID, "://")
						if len(parts) == 2 {
							subParts := strings.Split(parts[1], "/")
							if len(subParts) > 0 {
								moduleMap[subParts[0]] = true
							}
						}
					}
				}

				for _, rel := range fileRels {
					relationships = append(relationships, rel)
				}
			}

			return nil
		})

		if err != nil {
			errMsg := fmt.Sprintf("directory traversal failed: %v", err)
			log.Printf("ParserService: %s", errMsg)
			_ = s.ProjStore.UpdateStatus(proj.ID, project.StatusFailed, "", errMsg)
			return
		}

		var modules []string
		for mod := range moduleMap {
			modules = append(modules, mod)
		}

		// Compile Project IR schema
		projectIR := ProjectIR{
			SchemaVersion: "1.0.0",
			Name:          proj.Name,
			Version:       "1.0.0",
			Language:      "Go", // Currently supported default
			Repository:    proj.GitURL,
			Modules:       modules,
			Files:         files,
			Symbols:       symbols,
			Relationships: relationships,
			Metadata: Metadata{
				CreatedBy:   "ArchForge ParserService 1.0",
				Version:     1,
				Language:    "Go",
				Confidence:  1.0,
				GeneratedAt: time.Now(),
			},
		}

		// Save IR to output folder
		if err := os.MkdirAll(s.OutputDir, 0755); err != nil {
			errMsg := fmt.Sprintf("failed to create output IR folder: %v", err)
			log.Printf("ParserService: %s", errMsg)
			_ = s.ProjStore.UpdateStatus(proj.ID, project.StatusFailed, "", errMsg)
			return
		}

		irFilename := filepath.Join(s.OutputDir, fmt.Sprintf("%s.json", proj.ID))
		irFile, err := os.Create(irFilename)
		if err != nil {
			errMsg := fmt.Sprintf("failed to write IR json metadata file: %v", err)
			log.Printf("ParserService: %s", errMsg)
			_ = s.ProjStore.UpdateStatus(proj.ID, project.StatusFailed, "", errMsg)
			return
		}
		defer irFile.Close()

		encoder := json.NewEncoder(irFile)
		encoder.SetIndent("", "  ")
		if err := encoder.Encode(projectIR); err != nil {
			errMsg := fmt.Sprintf("failed to serialize IR json: %v", err)
			log.Printf("ParserService: %s", errMsg)
			_ = s.ProjStore.UpdateStatus(proj.ID, project.StatusFailed, "", errMsg)
			return
		}

		// Update to PARSED
		_ = s.ProjStore.UpdateStatus(proj.ID, project.StatusParsed, proj.CommitHash, "")
		log.Printf("ParserService: successfully completed parsing task on %s", proj.ID)
	}()
}
