package project

import (
	"errors"
	"sync"
	"time"
)

type ProjectStatus string

const (
	StatusPending   ProjectStatus = "PENDING"
	StatusCloning   ProjectStatus = "CLONING"
	StatusCompleted ProjectStatus = "COMPLETED"
	StatusFailed    ProjectStatus = "FAILED"
	StatusParsing   ProjectStatus = "PARSING"
	StatusParsed    ProjectStatus = "PARSED"
)

var (
	ErrProjectNotFound = errors.New("project not found")
)

type Project struct {
	ID         string        `json:"id"`
	Name       string        `json:"name"`
	GitURL     string        `json:"git_url"`
	LocalPath  string        `json:"local_path"`
	Branch     string        `json:"branch"`
	CommitHash string        `json:"commit_hash,omitempty"`
	Status     ProjectStatus `json:"status"`
	OwnerID    string        `json:"owner_id"`
	CreatedAt  time.Time     `json:"created_at"`
	Error      string        `json:"error,omitempty"`
}

type ProjectStore interface {
	Create(project *Project) error
	GetByID(id string) (*Project, error)
	ListByOwner(ownerID string) ([]*Project, error)
	UpdateStatus(id string, status ProjectStatus, commitHash string, errStr string) error
}

type InMemoryProjectStore struct {
	mu       sync.RWMutex
	projects map[string]*Project
}

func NewInMemoryProjectStore() *InMemoryProjectStore {
	return &InMemoryProjectStore{
		projects: make(map[string]*Project),
	}
}

func (s *InMemoryProjectStore) Create(project *Project) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.projects[project.ID] = project
	return nil
}

func (s *InMemoryProjectStore) GetByID(id string) (*Project, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	p, exists := s.projects[id]
	if !exists {
		return nil, ErrProjectNotFound
	}
	return p, nil
}

func (s *InMemoryProjectStore) ListByOwner(ownerID string) ([]*Project, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var list []*Project
	for _, p := range s.projects {
		if p.OwnerID == ownerID {
			list = append(list, p)
		}
	}
	return list, nil
}

func (s *InMemoryProjectStore) UpdateStatus(id string, status ProjectStatus, commitHash string, errStr string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, exists := s.projects[id]
	if !exists {
		return ErrProjectNotFound
	}
	p.Status = status
	p.CommitHash = commitHash
	p.Error = errStr
	return nil
}
