package parser

import "time"

type ProjectIR struct {
	SchemaVersion string         `json:"schemaVersion"`
	Name          string         `json:"name"`
	Version       string         `json:"version"`
	Language      string         `json:"language"`
	Repository    string         `json:"repository"`
	Modules       []string       `json:"modules"`
	Files         []FileIR       `json:"files"`
	Symbols       []Symbol       `json:"symbols"`
	Relationships []Relationship `json:"relationships"`
	Metadata      Metadata       `json:"metadata"`
}

type FileIR struct {
	Path     string   `json:"path"`
	Checksum string   `json:"checksum"`
	Language string   `json:"language"`
	Size     int64    `json:"size"`
	Imports  []string `json:"imports"`
	Exports  []string `json:"exports"`
}

type Location struct {
	File        string `json:"file"`
	LineStart   int    `json:"lineStart"`
	LineEnd     int    `json:"lineEnd"`
	ColumnStart int    `json:"columnStart"`
	ColumnEnd   int    `json:"columnEnd"`
}

type Symbol struct {
	ID            string                 `json:"id"`
	Name          string                 `json:"name"`
	Kind          string                 `json:"kind"` // e.g. Class, Struct, Interface, Method, Function, Package
	QualifiedName string                 `json:"qualifiedName"`
	Visibility    string                 `json:"visibility"`
	Location      Location               `json:"location"`
	Documentation string                 `json:"documentation"`
	CodeSnippet   string                 `json:"codeSnippet"`
	Signature     string                 `json:"signature"`
	Children      []string               `json:"children,omitempty"` // IDs of nested child symbols
	Metadata      map[string]interface{} `json:"metadata,omitempty"`
}

type Relationship struct {
	Source     string  `json:"source"`
	Target     string  `json:"target"`
	Type       string  `json:"type"` // e.g. CALLS, IMPLEMENTS, IMPORTS, CONTAINS, EXTENDS
	Weight     int     `json:"weight"`
	Confidence float64 `json:"confidence"`
}

type Metadata struct {
	CreatedBy   string    `json:"createdBy"`
	Version     int       `json:"version"`
	Language    string    `json:"language"`
	Confidence  float64   `json:"confidence"`
	GeneratedAt time.Time `json:"generatedAt"`
}
