package parser

import (
	"path/filepath"
	"sync"
)

type LanguageAdapter interface {
	ParseFile(rootPath, relPath string) (*FileIR, []Symbol, []Relationship, error)
}

type ParserManager struct {
	mu       sync.RWMutex
	adapters map[string]LanguageAdapter
}

func NewParserManager() *ParserManager {
	return &ParserManager{
		adapters: make(map[string]LanguageAdapter),
	}
}

func (m *ParserManager) RegisterAdapter(ext string, adapter LanguageAdapter) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.adapters[ext] = adapter
}

func (m *ParserManager) GetAdapter(ext string) (LanguageAdapter, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	a, exists := m.adapters[ext]
	return a, exists
}

func (m *ParserManager) DetectAndParse(rootPath, relPath string) (*FileIR, []Symbol, []Relationship, error) {
	ext := filepath.Ext(relPath)
	base := filepath.Base(relPath)

	// Try checking the full base name first (e.g., "Dockerfile")
	adapter, exists := m.GetAdapter(base)
	if !exists {
		// Fallback to extension (e.g., ".go", ".ts")
		adapter, exists = m.GetAdapter(ext)
	}

	if !exists {
		return nil, nil, nil, nil // Skip file parsing if no registered adapter
	}
	return adapter.ParseFile(rootPath, relPath)
}
