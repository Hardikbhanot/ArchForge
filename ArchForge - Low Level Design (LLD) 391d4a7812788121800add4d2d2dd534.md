# ArchForge - Low Level Design (LLD)

Define internal modules, interfaces, boundaries, and contracts.

## Core Modules

- API Gateway
- Auth
- Repository Service
- Language Detection
- Parser Manager
- IR Builder
- Symbol Index
- Graph Builder
- Embedding Service
- Retrieval Orchestrator
- Agent Orchestrator
- UI API

## Folder Structure

/core

/parsers

/agents

/internal

/pkg

/api

/web

## Request Flow

Repository -> Parser -> IR -> Graph/Symbols/Vectors -> Retrieval -> Agent -> Response.

## Design Rules

- Interfaces first
- Dependency injection
- Async indexing
- Plugin loading via registry
- No module accesses raw source after IR generation.

[ArchForge - Product Requirements Document (PRD)](https://app.notion.com/p/ArchForge-Product-Requirements-Document-PRD-391d4a78127881409d00f37fee883ff7?pvs=21)