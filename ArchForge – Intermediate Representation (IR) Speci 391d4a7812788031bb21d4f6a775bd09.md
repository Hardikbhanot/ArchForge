# ArchForge – Intermediate Representation (IR) Specification

# ArchForge – Intermediate Representation (IR) Specification

**Version:** 1.0
**Status:** Draft
**Audience:** Platform Engineers, SDK Developers, Parser Authors, AI Engineers

---

# 1. Overview

The Intermediate Representation (IR) is the canonical data model used throughout the ArchForge platform.

Every supported programming language (Java, Python, TypeScript, Go, C#, Kotlin, etc.) is transformed into the same language-agnostic representation before any downstream processing occurs.

This abstraction allows all analysis engines, retrieval pipelines, AI agents, architecture generators, and visualization tools to operate independently of the source language.

```
Source Code
      │
      ▼
 Language Parser
      │
      ▼
  Language AST
      │
      ▼
 IR Converter
      │
      ▼
 ArchForge IR
      │
 ┌────┼───────────────┐
 ▼    ▼               ▼
Knowledge Graph   Vector Store   AI Agents
```

The IR acts as the single source of truth inside the platform.

---

# 2. Design Goals

The IR is designed to satisfy the following principles:

- Language independent
- Loss-minimized
- Easily serializable
- AI friendly
- Graph compatible
- Incrementally updatable
- Versioned
- Deterministic
- Extensible

---

# 3. Core Components

The IR consists of six major building blocks.

## Project

Represents an entire software project.

Example attributes:

- name
- version
- language
- repository
- modules
- metadata

---

## Module

Represents a package, namespace, or logical grouping.

Examples

Java

```
com.archforge.parser
```

Python

```
services.payment
```

TypeScript

```
src/controllers
```

---

## File

Represents one physical source file.

Example

```
PaymentService.java
```

Metadata

- path
- checksum
- language
- size
- imports
- exports

---

## Symbol

Represents any named program element.

Examples

- Class
- Interface
- Enum
- Method
- Function
- Variable
- Constant
- Annotation
- Generic Type
- Lambda
- Property

Each symbol receives a globally unique identifier.

Example

```
symbolId

java://payment/PaymentService/processOrder
```

---

## Relationship

Represents connections between symbols.

Supported relationship types include

- CALLS
- IMPLEMENTS
- EXTENDS
- DEPENDS_ON
- IMPORTS
- THROWS
- REFERENCES
- USES
- CREATES
- RETURNS
- READS
- WRITES
- CONTAINS
- BELONGS_TO

Relationships are directional.

Example

```
PaymentController

CALLS

PaymentService
```

---

## Metadata

Every object contains metadata.

```
{
  "createdBy": "JavaParser",
  "version": 4,
  "language": "Java",
  "confidence": 1.0,
  "generatedAt": "2026-07-02T12:30:00Z"
}
```

---

# 4. Symbol Model

Every symbol follows a common schema.

```json
{
  "id": "...",
  "name": "...",
  "kind": "Class",
  "qualifiedName": "...",
  "visibility": "public",
  "annotations": [],
  "modifiers": [],
  "location": {},
  "documentation": "...",
  "signature": "...",
  "children": []
}
```

---

## Supported Symbol Types

- Project
- Module
- Package
- Namespace
- File
- Class
- Interface
- Enum
- Record
- Trait
- Object
- Function
- Method
- Constructor
- Property
- Variable
- Parameter
- Constant
- Generic Parameter
- Lambda
- Annotation
- Decorator
- Import
- Export

---

# 5. Location Model

Every symbol contains an exact location.

```json
{
  "file":"PaymentService.java",
  "lineStart":41,
  "lineEnd":82,
  "columnStart":5,
  "columnEnd":17
}
```

This enables

- IDE navigation
- AI citations
- Documentation generation
- Incremental parsing

---

# 6. Dependency Graph

All dependencies become graph edges.

```
PaymentController

      │

      ▼

PaymentService

      │

      ▼

PaymentRepository

      │

      ▼

Database
```

Each edge contains

```json
{
   "source":"...",
   "target":"...",
   "type":"CALLS",
   "weight":1,
   "confidence":1.0
}
```

---

# 7. AI Semantic Metadata

The parser enriches symbols with AI-oriented metadata.

Example

```json
{
  "summary":"Processes customer orders",
  "domain":"Payments",
  "keywords":[
      "checkout",
      "order",
      "payment"
  ],
  "complexity":"Medium"
}
```

Additional metadata generated later in the pipeline may include

- architectural layer
- business capability
- security classification
- ownership
- bounded context
- API exposure
- service affinity

---

# 8. Incremental Updates

ArchForge avoids rebuilding the entire project.

Pipeline

```
File Changed

↓

Parser

↓

Updated AST

↓

Updated IR

↓

Affected Graph Nodes

↓

Affected Embeddings

↓

Affected Documentation

↓

Affected AI Context
```

This enables near real-time synchronization.

---

# 9. Serialization Format

The canonical storage format is JSON.

Optional exports

- Protocol Buffers
- Apache Arrow
- MessagePack

Example

```json
{
  "project":{},
  "modules":[],
  "files":[],
  "symbols":[],
  "relationships":[]
}
```

---

# 10. Validation Rules

Every IR document must satisfy the following constraints:

- Every symbol has a unique ID.
- All referenced symbols exist.
- Cyclic containment is prohibited.
- Source locations must be valid.
- Relationship types must belong to the supported vocabulary.
- Duplicate identifiers are rejected.
- Schema version is mandatory.
- Unknown language extensions must be namespaced.

Validation failures are surfaced during ingestion and block downstream indexing until resolved.

---

# 11. Language Adapters

Each language implements a dedicated adapter responsible for translating its native AST into the canonical IR.

Current adapter targets:

| Language | Parser | Status |
| --- | --- | --- |
| Java | JavaParser | Planned |
| Python | Tree-sitter | Planned |
| TypeScript | TypeScript Compiler API | Planned |
| Go | go/ast | Planned |
| C# | Roslyn | Planned |
| Kotlin | Kotlin Compiler | Planned |

Each adapter must produce semantically equivalent IR objects regardless of source-language syntax.

---

# 12. Transformation Pipeline

```
Repository
      │
      ▼
Language Detection
      │
      ▼
Parser
      │
      ▼
Native AST
      │
      ▼
IR Builder
      │
      ▼
Validation
      │
      ▼
Knowledge Graph
      │
      ├────────► Vector Index
      │
      ├────────► Documentation Generator
      │
      ├────────► Architecture Engine
      │
      └────────► AI Agent Runtime
```

Each stage is independently testable and can be executed as part of batch processing or an incremental update triggered by repository changes.

---

# 13. Versioning Strategy

The IR schema follows semantic versioning.

- **Major:** Breaking schema changes.
- **Minor:** Backward-compatible additions.
- **Patch:** Clarifications, metadata additions, or validation improvements.

Every serialized document includes:

```json
{
  "schemaVersion": "1.0.0"
}
```

Migration utilities should be provided for major-version upgrades.

---

# 14. Extension Points

To support ecosystem growth, the IR allows controlled extensions.

Extension categories include:

- Custom symbol kinds
- Domain-specific metadata
- Language-specific attributes
- Organization-defined relationship types
- AI-generated annotations

All custom extensions must be namespaced to avoid collisions.

Example:

```json
{
  "extensions": {
    "com.example.security": {
      "riskLevel": "High",
      "owner": "Platform Team"
    }
  }
}
```

---

# 15. Performance Considerations

The IR is designed for repositories ranging from small utilities to multi-million-line monorepos.

Key optimization strategies:

- Lazy loading of symbols
- Incremental graph updates
- Content-addressable hashing
- Parallel parsing pipelines
- Batched persistence
- Memory-efficient edge storage
- Streaming serialization for large repositories

Target performance goals:

- Incremental updates under 2 seconds for typical file changes
- Linear scalability with repository size
- Minimal recomputation of unaffected artifacts

---

# 16. Future Enhancements

Planned capabilities include:

- Cross-repository IR linking
- Runtime execution traces mapped onto IR
- Automated architecture drift detection
- Dependency impact simulation
- Security and compliance annotations
- Test coverage overlays
- Performance profiling metadata
- Live synchronization with IDEs and CI/CD pipelines

---

# 17. Summary

The Intermediate Representation is the foundational abstraction within ArchForge. By transforming diverse programming languages into a unified, versioned, graph-oriented model, the platform enables consistent documentation generation, architecture analysis, semantic search, AI-assisted reasoning, and knowledge graph construction. Every downstream subsystem consumes the same canonical representation, ensuring extensibility, interoperability, and predictable behavior as the platform evolves.