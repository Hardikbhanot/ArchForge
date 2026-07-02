# ArchForge - Product Requirements Document (PRD)

Build ArchForge as an extensible, language-agnostic AI Software Intelligence Platform.

## Product Principles

- Language agnostic
- Everything is pluggable
- IR is the canonical representation
- Hybrid retrieval (Graph + Symbols + Vectors)
- LLM optional
- Never send full repositories to the model

## Problem Statement

Developers struggle to understand large codebases. Existing tools are language-specific or rely solely on semantic search.

## Goals

- Analyze repositories in multiple languages
- Generate architecture understanding
- AI-assisted repository exploration
- Plugin-based parsers and agents

## Functional Requirements

- GitHub/ZIP ingestion
- Parser framework
- Knowledge graph
- Vector search
- Symbol index
- AI chat
- Architecture diagrams
- Documentation generation
- Plugin SDK

## Non-functional Requirements

Performance, scalability, extensibility, security, observability, self-hosting.

## MVP Scope

Repository ingestion, hybrid retrieval, multi-language parsing, AI chat, architecture visualization, documentation, plugin framework.

## Future Vision

Marketplace for agents and parsers, IDE integrations, enterprise features, multi-repository reasoning.