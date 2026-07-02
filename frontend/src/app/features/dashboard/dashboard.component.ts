import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { Subscription, interval, startWith, switchMap } from 'rxjs';

export interface Project {
  id: string;
  name: string;
  git_url: string;
  local_path: string;
  branch: string;
  commit_hash?: string;
  status: string;
  owner_id: string;
  created_at: string;
  error?: string;
}

interface Overview {
  name: string;
  stack: string;
  mvp: string[];
  status: string;
  description: string;
}

export interface GithubRepo {
  name: string;
  full_name: string;
  description: string;
  html_url: string;
  default_branch: string;
  language: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="dashboard-container">
      <div class="glow-mesh-1"></div>
      <div class="glow-mesh-2"></div>

      <header class="header">
        <div class="brand">
          <span class="logo-icon">▲</span>
          <h1>ArchForge</h1>
        </div>
        <div class="user-menu">
          <span class="username">Welcome, {{ authService.currentUser()?.username }}</span>
          <button (click)="logout()" class="btn-logout">Logout</button>
        </div>
      </header>

      <main class="main-content">
        <section class="hero-section">
          <h2>Codebase Intelligence Platform</h2>
          <p class="desc">
            Understand, index, and reason about software repositories using language-agnostic intermediate representations and hybrid graph-vector retrieval.
          </p>
        </section>

        <!-- GitHub Repos Direct Import -->
        <section class="card github-repos-card">
          <div class="card-title-row">
            <h3>Your GitHub Repositories</h3>
            @if (githubRepos().length > 0) {
              <div class="search-box">
                <input 
                  type="text" 
                  [ngModel]="githubSearchQuery()" 
                  (ngModelChange)="githubSearchQuery.set($event)" 
                  placeholder="Search your repos..."
                />
              </div>
            }
          </div>

          @if (githubLoading()) {
            <div class="gh-loading-state">
              <span class="spinner-sm"></span> Loading repositories...
            </div>
          } @else if (githubError()) {
            <div class="gh-error-state">
              @if (githubError() === 'GitHub account not connected') {
                <p class="error-detail">Connect your GitHub account to list and import your repositories directly with one click.</p>
                <button (click)="connectGitHub()" class="btn-github-connect">Connect GitHub Account</button>
              } @else {
                <p class="error-text">Failed to fetch GitHub repositories: {{ githubError() }}</p>
                <button (click)="fetchGithubRepos()" class="btn-retry-sm">Retry Connection</button>
              }
            </div>
          } @else if (filteredRepos().length > 0) {
            <div class="repos-list-container">
              <div class="repos-grid">
                @for (repo of filteredRepos(); track repo.full_name) {
                  <div class="repo-item-card">
                    <div class="repo-details">
                      <div class="repo-name-row">
                        <h5>{{ repo.name }}</h5>
                        @if (repo.language) {
                          <span class="repo-lang-badge">{{ repo.language }}</span>
                        }
                      </div>
                      <p class="repo-desc">{{ repo.description || 'No description provided' }}</p>
                    </div>
                    <button 
                      (click)="quickIngest(repo)" 
                      [disabled]="isAlreadyIngested(repo.html_url) || isImporting()" 
                      class="btn-quick-ingest"
                      [class.ingested]="isAlreadyIngested(repo.html_url)"
                    >
                      @if (isAlreadyIngested(repo.html_url)) {
                        ✓ Ingested
                      } @else {
                        Quick Ingest
                      }
                    </button>
                  </div>
                }
              </div>
            </div>
          } @else {
            <div class="empty-state-sm">
              <p>No repositories found matching search query.</p>
            </div>
          }
        </section>

        <!-- Import Section -->
        <section class="card import-card">
          <h3>Import by URL</h3>
          <form [formGroup]="importForm" (ngSubmit)="onImport()" class="import-form">
            <div class="form-row">
              <div class="input-group flex-3">
                <input 
                  type="text" 
                  formControlName="git_url" 
                  placeholder="https://github.com/owner/repo.git or git@github.com:owner/repo.git"
                  [class.invalid]="isFieldInvalid('git_url')"
                />
                @if (isFieldInvalid('git_url')) {
                  <span class="error-msg">Git URL is required</span>
                }
              </div>
              <div class="input-group flex-1">
                <input 
                  type="text" 
                  formControlName="branch" 
                  placeholder="main / master (optional)"
                />
              </div>
              <button type="submit" [disabled]="importForm.invalid || isImporting()" class="btn-import">
                @if (isImporting()) {
                  <span class="spinner-sm"></span> Ingesting...
                } @else {
                  Import Repository
                }
              </button>
            </div>
            @if (importError()) {
              <div class="error-banner animate-fade-in">
                <span>⚠</span> {{ importError() }}
              </div>
            }
          </form>
        </section>

        <!-- Projects Grid/Table -->
        <section class="projects-section">
          <div class="section-header">
            <h3>Your Ingested Repositories</h3>
          </div>

          @if (projects().length > 0) {
            <div class="projects-list">
              @for (p of projects(); track p.id) {
                <div class="project-row" [class.status-failed]="p.status === 'FAILED'">
                  <div class="project-info">
                    <div class="title-row">
                      <h4>{{ p.name }}</h4>
                      <span class="status-badge" [class]="p.status.toLowerCase()">
                        @if (p.status === 'CLONING' || p.status === 'PENDING' || p.status === 'PARSING') {
                          <span class="spinner-dot"></span>
                        }
                        {{ p.status }}
                      </span>
                    </div>
                    <p class="git-url">{{ p.git_url }}</p>
                    @if (p.branch) {
                      <div class="meta-tags">
                        <span class="meta-tag">⌥ {{ p.branch }}</span>
                        @if (p.commit_hash) {
                          <span class="meta-tag hash"># {{ p.commit_hash.substring(0, 7) }}</span>
                        }
                      </div>
                    }
                  </div>
                  <div class="project-actions">
                    @if (p.status === 'FAILED') {
                      <div class="failed-action-row">
                        <p class="error-desc">{{ p.error || 'Cloning task terminated unexpectedly' }}</p>
                        <button (click)="analyzeProject(p)" class="btn-action-primary">Re-Analyze</button>
                      </div>
                    } @else if (p.status === 'COMPLETED') {
                      <button (click)="analyzeProject(p)" class="btn-action-primary">Analyze Codebase</button>
                    } @else if (p.status === 'PARSING') {
                      <p class="parsing-desc">Extracting AST symbols...</p>
                    } @else if (p.status === 'PARSED') {
                      <div class="action-btn-row">
                        <button (click)="viewInsights(p)" class="btn-action-success">View Insights</button>
                        <button (click)="downloadIRDirect(p)" class="btn-action-outline">Download IR</button>
                      </div>
                    } @else {
                      <p class="cloning-desc">Running git clone on server...</p>
                    }
                  </div>
                </div>
              }
            </div>
          } @else {
            <div class="empty-state">
              <p>No repositories imported yet. Provide a repository URL above to start cloning and ingestion.</p>
            </div>
          }
        </section>

        <!-- Insights Display Section -->
        @if (selectedProjectIR() || loadingIR() || errorIR()) {
          <section class="card insights-card animate-fade-in" id="insights-panel">
            <div class="insights-header">
              <div class="insights-title-row">
                <h3>Codebase Insights: {{ selectedProjectName() }}</h3>
                <span class="badge">IR Version {{ selectedProjectIR()?.schemaVersion || '1.0' }}</span>
              </div>
              <button (click)="closeInsights()" class="btn-close">×</button>
            </div>

            @if (loadingIR()) {
              <div class="insights-loading">
                <span class="spinner-sm"></span> Loading intermediate representation analysis...
              </div>
            } @else if (errorIR()) {
              <div class="insights-error">
                <p class="error-text">Error: {{ errorIR() }}</p>
                <button (click)="closeInsights()" class="btn-retry-sm">Dismiss</button>
              </div>
            } @else {
              <!-- Project Statistics Overview -->
              <div class="stats-grid">
                <div class="stat-box">
                  <span class="stat-val">{{ selectedProjectIR()?.files?.length || 0 }}</span>
                  <span class="stat-lbl">Source Files</span>
                </div>
                <div class="stat-box">
                  <span class="stat-val">{{ getSymbolsCount('Struct') }}</span>
                  <span class="stat-lbl">Structs / Classes</span>
                </div>
                <div class="stat-box">
                  <span class="stat-val">{{ getSymbolsCount('Interface') }}</span>
                  <span class="stat-lbl">Interfaces</span>
                </div>
                <div class="stat-box">
                  <span class="stat-val">{{ getSymbolsCount('Function') + getSymbolsCount('Method') }}</span>
                  <span class="stat-lbl">Functions & Methods</span>
                </div>
              </div>

              <!-- Symbol Explorer -->
              <div class="explorer-section">
                <h4>Extracted Symbols Registry</h4>
                @if (selectedProjectIR()?.symbols?.length > 0) {
                  <div class="symbols-table-container">
                    <table class="symbols-table">
                      <thead>
                        <tr>
                          <th>Symbol</th>
                          <th>Kind</th>
                          <th>Package</th>
                          <th>Defined In</th>
                          <th>Location</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (sym of selectedProjectIR()?.symbols; track sym.id) {
                          <tr>
                            <td class="sym-name-col">
                              <span class="sym-id-code" [title]="sym.id">{{ sym.name }}</span>
                              @if (sym.documentation) {
                                <p class="sym-doc-preview" [title]="sym.documentation">{{ sym.documentation }}</p>
                              }
                            </td>
                            <td><span class="kind-badge" [class]="sym.kind.toLowerCase()">{{ sym.kind }}</span></td>
                            <td><span class="pkg-badge">{{ getPackageFromSymbol(sym) }}</span></td>
                            <td class="file-path-col" [title]="sym.location.file">{{ getFileName(sym.location.file) }}</td>
                            <td>Line {{ sym.location.lineStart }} - {{ sym.location.lineEnd }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                } @else {
                  <div class="empty-state-sm">
                    <p>No symbols parsed from this codebase yet. (Only Go files are currently analyzed.)</p>
                  </div>
                }
              </div>

              <div class="insights-actions">
                <button (click)="downloadIR()" class="btn-download-ir">Download Canonical IR JSON</button>
              </div>
            }
          </section>
        }

        <!-- Overview details -->
        @if (overview()) {
          <div class="grid-layout">
            <div class="card overview-card">
              <div class="card-header">
                <h3>System Overview</h3>
                <span class="badge">{{ overview()?.status }}</span>
              </div>
              <p class="description">{{ overview()?.description }}</p>
              <div class="meta-row">
                <span class="meta-label">Stack:</span>
                <span class="meta-value">{{ overview()?.stack }}</span>
              </div>
            </div>

            <div class="card features-card">
              <h3>MVP Core Features</h3>
              <ul class="feature-list">
                @for (feat of overview()?.mvp; track feat) {
                  <li>
                    <span class="check-icon">✓</span>
                    <span class="feat-name">{{ feat }}</span>
                  </li>
                }
              </ul>
            </div>
          </div>
        }
      </main>
    </div>
  `,
  styles: [`
    .dashboard-container {
      position: relative;
      width: 100vw;
      min-height: 100vh;
      background: #020617;
      color: #f8fafc;
      font-family: 'Outfit', 'Inter', sans-serif;
      box-sizing: border-box;
      overflow-x: hidden;
    }

    .glow-mesh-1, .glow-mesh-2 {
      position: absolute;
      width: 800px;
      height: 800px;
      border-radius: 50%;
      filter: blur(140px);
      opacity: 0.1;
      pointer-events: none;
      z-index: 0;
    }

    .glow-mesh-1 {
      top: -20%;
      left: -10%;
      background: radial-gradient(circle, #3b82f6 0%, transparent 70%);
    }

    .glow-mesh-2 {
      bottom: -10%;
      right: -10%;
      background: radial-gradient(circle, #8b5cf6 0%, transparent 70%);
    }

    .header {
      position: relative;
      z-index: 1;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem 3rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      background: rgba(15, 23, 42, 0.2);
      backdrop-filter: blur(10px);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .logo-icon {
      font-size: 1.5rem;
      color: #3b82f6;
      text-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
    }

    .brand h1 {
      font-size: 1.25rem;
      font-weight: 800;
      letter-spacing: -0.025em;
      margin: 0;
    }

    .user-menu {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }

    .username {
      font-size: 0.875rem;
      color: #94a3b8;
      font-weight: 500;
    }

    .btn-logout {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #f1f5f9;
      padding: 0.5rem 1rem;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.8125rem;
      font-weight: 600;
      transition: all 0.2s;
    }

    .btn-logout:hover {
      background: rgba(239, 68, 68, 0.1);
      border-color: rgba(239, 68, 68, 0.3);
      color: #fca5a5;
    }

    .main-content {
      position: relative;
      z-index: 1;
      max-width: 1200px;
      margin: 0 auto;
      padding: 4rem 2rem;
      display: flex;
      flex-direction: column;
      gap: 2.5rem;
    }

    .hero-section {
      text-align: center;
      margin-bottom: 1.5rem;
    }

    .hero-section h2 {
      font-size: 2.5rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      margin: 0;
      background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .hero-section .desc {
      font-size: 1.125rem;
      color: #94a3b8;
      max-width: 680px;
      margin: 1rem auto 0;
      line-height: 1.6;
    }

    /* GitHub Repos Selection */
    .github-repos-card {
      padding: 2rem;
    }

    .card-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .card-title-row h3 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 750;
    }

    .search-box input {
      padding: 0.5rem 1rem;
      border-radius: 8px;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #f8fafc;
      font-size: 0.875rem;
      width: 220px;
      box-sizing: border-box;
      outline: none;
    }

    .search-box input:focus {
      border-color: #3b82f6;
    }

    .gh-loading-state, .gh-error-state, .empty-state-sm {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      text-align: center;
      color: #94a3b8;
      background: rgba(15, 23, 42, 0.2);
      border: 1px dashed rgba(255, 255, 255, 0.05);
      border-radius: 12px;
    }

    .error-detail {
      font-size: 0.9375rem;
      margin: 0 0 1.25rem;
    }

    .btn-github-connect {
      padding: 0.625rem 1.25rem;
      border-radius: 8px;
      background: #24292e;
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.1);
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-github-connect:hover {
      background: #2f363d;
    }

    .btn-retry-sm {
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #cbd5e1;
      padding: 0.4rem 1rem;
      border-radius: 6px;
      font-size: 0.8125rem;
      cursor: pointer;
      margin-top: 0.5rem;
    }

    .repos-list-container {
      border: 1px solid rgba(255, 255, 255, 0.05);
      background: rgba(15, 23, 42, 0.25);
      border-radius: 12px;
      padding: 0.75rem;
    }

    .repos-grid {
      display: grid;
      gap: 0.75rem;
      max-height: 300px;
      overflow-y: auto;
      padding-right: 0.5rem;
    }

    /* Custom scrollbar styling for high-fidelity feel */
    .repos-grid::-webkit-scrollbar {
      width: 6px;
    }
    .repos-grid::-webkit-scrollbar-track {
      background: transparent;
    }
    .repos-grid::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 99px;
    }
    .repos-grid::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .repo-item-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(15, 23, 42, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.02);
      border-radius: 10px;
      padding: 1rem 1.5rem;
      transition: all 0.2s ease;
    }

    .repo-item-card:hover {
      background: rgba(15, 23, 42, 0.6);
      border-color: rgba(59, 130, 246, 0.15);
    }

    .repo-details {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .repo-name-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .repo-name-row h5 {
      font-size: 0.9375rem;
      font-weight: 700;
      margin: 0;
      color: #f1f5f9;
    }

    .repo-lang-badge {
      font-size: 0.6875rem;
      font-weight: 700;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      background: rgba(59, 130, 246, 0.1);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.15);
    }

    .repo-desc {
      font-size: 0.8125rem;
      color: #64748b;
      margin: 0;
      max-width: 580px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .btn-quick-ingest {
      padding: 0.5rem 1rem;
      border-radius: 8px;
      background: rgba(59, 130, 246, 0.1);
      border: 1px solid rgba(59, 130, 246, 0.2);
      color: #60a5fa;
      font-size: 0.8125rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-quick-ingest:hover:not(:disabled) {
      background: #2563eb;
      color: white;
      border-color: #2563eb;
    }

    .btn-quick-ingest.ingested {
      background: rgba(16, 185, 129, 0.08);
      border-color: rgba(16, 185, 129, 0.15);
      color: #10b981;
      cursor: default;
    }

    /* Import Form Layout */
    .import-card {
      padding: 2.5rem;
    }

    .import-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-top: 1.5rem;
    }

    .form-row {
      display: flex;
      gap: 1rem;
      align-items: flex-start;
      width: 100%;
    }

    .flex-3 { flex: 3; }
    .flex-1 { flex: 1; }

    .input-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .import-form input {
      width: 100%;
      padding: 0.875rem 1.25rem;
      border-radius: 12px;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #f8fafc;
      font-size: 0.9375rem;
      transition: all 0.2s ease;
      box-sizing: border-box;
    }

    .import-form input:focus {
      outline: none;
      border-color: #3b82f6;
      background: rgba(15, 23, 42, 0.8);
      box-shadow: 0 0 15px rgba(59, 130, 246, 0.15);
    }

    .import-form input.invalid {
      border-color: rgba(239, 68, 68, 0.4);
    }

    .btn-import {
      padding: 0.875rem 1.5rem;
      border-radius: 12px;
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      color: white;
      font-size: 0.9375rem;
      font-weight: 700;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
      transition: all 0.2s ease;
      white-space: nowrap;
    }

    .btn-import:hover:not(:disabled) {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      box-shadow: 0 8px 20px rgba(37, 99, 235, 0.4);
    }

    .btn-import:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      background: #334155;
      box-shadow: none;
    }

    .error-banner {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.875rem 1.25rem;
      border-radius: 12px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      color: #fca5a5;
      font-size: 0.875rem;
      margin-top: 0.5rem;
    }

    .error-msg {
      font-size: 0.75rem;
      color: #f87171;
    }

    /* Projects list layout */
    .projects-section {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .section-header h3 {
      font-size: 1.25rem;
      font-weight: 750;
      margin: 0;
    }

    .projects-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .project-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(15, 23, 42, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 16px;
      padding: 1.75rem 2rem;
      transition: all 0.2s ease;
    }

    .project-row:hover {
      background: rgba(15, 23, 42, 0.45);
      border-color: rgba(59, 130, 246, 0.2);
      transform: translateX(4px);
    }

    .project-row.status-failed {
      border-color: rgba(239, 68, 68, 0.15);
    }

    .project-info {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    .title-row {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .title-row h4 {
      font-size: 1.1rem;
      font-weight: 700;
      margin: 0;
      color: #f1f5f9;
    }

    .git-url {
      font-size: 0.8125rem;
      color: #64748b;
      margin: 0;
    }

    .meta-tags {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.25rem;
    }

    .meta-tag {
      font-size: 0.75rem;
      font-weight: 600;
      color: #94a3b8;
      background: rgba(255, 255, 255, 0.05);
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
    }

    .meta-tag.hash {
      color: #3b82f6;
      background: rgba(59, 130, 246, 0.08);
      font-family: monospace;
    }

    .status-badge {
      font-size: 0.7rem;
      font-weight: 800;
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .status-badge.pending, .status-badge.cloning, .status-badge.parsing {
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.2);
      color: #f59e0b;
    }

    .status-badge.completed {
      background: rgba(59, 130, 246, 0.1);
      border: 1px solid rgba(59, 130, 246, 0.2);
      color: #60a5fa;
    }

    .status-badge.parsed {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.2);
      color: #10b981;
    }

    .status-badge.failed {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }

    .spinner-dot {
      width: 0.4rem;
      height: 0.4rem;
      border-radius: 50%;
      background: currentColor;
      animation: pulse 1.2s infinite alternate;
    }

    .cloning-desc, .parsing-desc {
      font-size: 0.8125rem;
      color: #f59e0b;
      margin: 0;
      font-style: italic;
    }

    .failed-action-row {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.5rem;
    }

    .error-desc {
      font-size: 0.8125rem;
      color: #ef4444;
      margin: 0;
      max-width: 320px;
      text-align: right;
      line-height: 1.4;
    }

    .action-btn-row {
      display: flex;
      gap: 0.75rem;
    }

    .btn-action-primary {
      padding: 0.5rem 1rem;
      border-radius: 8px;
      border: none;
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      color: white;
      font-weight: 700;
      font-size: 0.8125rem;
      cursor: pointer;
      box-shadow: 0 4px 10px rgba(37, 99, 235, 0.2);
      transition: all 0.2s;
    }

    .btn-action-primary:hover {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    }

    .btn-action-success {
      padding: 0.5rem 1rem;
      border-radius: 8px;
      border: none;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      font-weight: 700;
      font-size: 0.8125rem;
      cursor: pointer;
      box-shadow: 0 4px 10px rgba(16, 185, 129, 0.2);
      transition: all 0.2s;
    }

    .btn-action-success:hover {
      background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
    }

    .btn-action-outline {
      padding: 0.5rem 1rem;
      border-radius: 8px;
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #cbd5e1;
      font-weight: 600;
      font-size: 0.8125rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-action-outline:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.2);
      color: white;
    }

    /* Insights Section Styling */
    .insights-card {
      border: 1px solid rgba(139, 92, 246, 0.2);
      box-shadow: 0 10px 40px -10px rgba(139, 92, 246, 0.15);
      padding: 2.5rem;
    }

    .insights-card:hover {
      border-color: rgba(139, 92, 246, 0.4);
    }

    .insights-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 2rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      padding-bottom: 1rem;
    }

    .insights-title-row {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .insights-title-row h3 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 800;
      letter-spacing: -0.02em;
    }

    .btn-close {
      background: transparent;
      border: none;
      color: #64748b;
      font-size: 1.75rem;
      cursor: pointer;
      line-height: 1;
      padding: 0 0.5rem;
      transition: color 0.2s;
    }

    .btn-close:hover {
      color: #f1f5f9;
    }

    .insights-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 3rem;
      color: #94a3b8;
    }

    .insights-error {
      padding: 2rem;
      background: rgba(239, 68, 68, 0.08);
      border: 1px solid rgba(239, 68, 68, 0.15);
      border-radius: 12px;
      color: #fca5a5;
      text-align: center;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2.5rem;
    }

    .stat-box {
      background: rgba(15, 23, 42, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.03);
      border-radius: 16px;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
      box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .stat-val {
      font-size: 2.25rem;
      font-weight: 800;
      color: #8b5cf6;
      text-shadow: 0 0 15px rgba(139, 92, 246, 0.3);
    }

    .stat-lbl {
      font-size: 0.8125rem;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .explorer-section {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .explorer-section h4 {
      font-size: 1.1rem;
      font-weight: 750;
      margin: 0;
      color: #e2e8f0;
    }

    .symbols-table-container {
      border: 1px solid rgba(255, 255, 255, 0.05);
      background: rgba(15, 23, 42, 0.2);
      border-radius: 12px;
      max-height: 380px;
      overflow-y: auto;
    }

    /* Scrollbar for symbols explorer */
    .symbols-table-container::-webkit-scrollbar {
      width: 6px;
    }
    .symbols-table-container::-webkit-scrollbar-track {
      background: transparent;
    }
    .symbols-table-container::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.08);
      border-radius: 99px;
    }

    .symbols-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.875rem;
    }

    .symbols-table th {
      background: rgba(15, 23, 42, 0.6);
      padding: 0.875rem 1.25rem;
      font-weight: 700;
      color: #94a3b8;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .symbols-table td {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
      vertical-align: top;
      color: #cbd5e1;
    }

    .symbols-table tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }

    .sym-name-col {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .sym-id-code {
      font-family: monospace;
      font-weight: 700;
      color: #f1f5f9;
    }

    .sym-doc-preview {
      font-size: 0.75rem;
      color: #64748b;
      margin: 0;
      max-width: 380px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .kind-badge {
      font-size: 0.6875rem;
      font-weight: 700;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .kind-badge.struct {
      background: rgba(59, 130, 246, 0.1);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.15);
    }

    .kind-badge.interface {
      background: rgba(139, 92, 246, 0.1);
      color: #a78bfa;
      border: 1px solid rgba(139, 92, 246, 0.15);
    }

    .kind-badge.function {
      background: rgba(20, 184, 166, 0.1);
      color: #2dd4bf;
      border: 1px solid rgba(20, 184, 166, 0.15);
    }

    .kind-badge.method {
      background: rgba(99, 102, 241, 0.1);
      color: #818cf8;
      border: 1px solid rgba(99, 102, 241, 0.15);
    }

    .pkg-badge {
      font-size: 0.75rem;
      color: #94a3b8;
      background: rgba(255, 255, 255, 0.03);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-family: monospace;
    }

    .file-path-col {
      font-size: 0.8125rem;
      color: #64748b;
      font-family: monospace;
    }

    .insights-actions {
      display: flex;
      justify-content: flex-end;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      padding-top: 1.5rem;
      margin-top: 1rem;
    }

    .btn-download-ir {
      padding: 0.75rem 1.5rem;
      border-radius: 10px;
      background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
      color: white;
      font-weight: 700;
      font-size: 0.875rem;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
      transition: all 0.2s;
    }

    .btn-download-ir:hover {
      background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
      box-shadow: 0 8px 18px rgba(124, 58, 237, 0.4);
    }

    .empty-state {
      padding: 3rem;
      text-align: center;
      background: rgba(15, 23, 42, 0.15);
      border: 1px dashed rgba(255, 255, 255, 0.05);
      border-radius: 16px;
      color: #64748b;
    }

    .empty-state p {
      margin: 0;
      font-size: 0.9375rem;
    }

    /* Core Styles */
    .card {
      background: rgba(15, 23, 42, 0.45);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 20px;
      padding: 2rem;
      box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.3);
      transition: border-color 0.3s;
    }

    .card:hover {
      border-color: rgba(59, 130, 246, 0.25);
    }

    .card h3 {
      font-size: 1.25rem;
      font-weight: 750;
      margin: 0 0 1rem;
    }

    .grid-layout {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 2rem;
    }

    .overview-card .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.25rem;
    }

    .overview-card h3 {
      margin: 0;
    }

    .badge {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.25rem 0.625rem;
      border-radius: 9999px;
      background: rgba(59, 130, 246, 0.1);
      border: 1px solid rgba(59, 130, 246, 0.2);
      color: #60a5fa;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .description {
      font-size: 0.9375rem;
      color: #94a3b8;
      line-height: 1.5;
      margin-bottom: 1.5rem;
    }

    .meta-row {
      display: flex;
      gap: 0.5rem;
      font-size: 0.875rem;
    }

    .meta-label {
      color: #64748b;
      font-weight: 600;
    }

    .meta-value {
      color: #e2e8f0;
      font-weight: 500;
    }

    .feature-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .feature-list li {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .check-icon {
      color: #10b981;
      font-weight: bold;
    }

    .feat-name {
      font-size: 0.9375rem;
      color: #cbd5e1;
      text-transform: capitalize;
    }

    .spinner-sm {
      width: 0.875rem;
      height: 0.875rem;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      display: inline-block;
      vertical-align: middle;
      margin-right: 0.25rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @keyframes pulse {
      from { opacity: 0.4; }
      to { opacity: 1; }
    }

    @keyframes fade-in {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .animate-fade-in {
      animation: fade-in 0.2s ease forwards;
    }
  `]
})
export class DashboardComponent implements OnInit, OnDestroy {
  authService = inject(AuthService);
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);

  overview = signal<Overview | null>(null);
  projects = signal<Project[]>([]);
  
  // GitHub integration signals
  githubRepos = signal<GithubRepo[]>([]);
  githubLoading = signal(false);
  githubError = signal<string | null>(null);
  githubSearchQuery = signal('');

  filteredRepos = computed(() => {
    const query = this.githubSearchQuery().toLowerCase().trim();
    if (!query) return this.githubRepos();
    return this.githubRepos().filter(r => 
      r.name.toLowerCase().includes(query) || 
      (r.description && r.description.toLowerCase().includes(query))
    );
  });
  
  // Codebase parser insights signals
  selectedProjectIR = signal<any | null>(null);
  loadingIR = signal(false);
  errorIR = signal<string | null>(null);
  selectedProjectName = signal('');
  selectedProjectId = signal('');

  isImporting = signal(false);
  importError = signal<string | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  importForm = this.fb.group({
    git_url: ['', [Validators.required]],
    branch: ['']
  });

  private pollingSub?: Subscription;

  ngOnInit(): void {
    this.fetchOverview();
    this.fetchProjects();
    this.fetchGithubRepos();

    // Start status polling every 4 seconds
    this.pollingSub = interval(4000)
      .pipe(switchMap(() => this.http.get<Project[]>('http://localhost:8080/api/v1/projects')))
      .subscribe({
        next: (list) => {
          this.projects.set(list);
        },
        error: (err) => {
          console.error('Polling error', err);
        }
      });
  }

  ngOnDestroy(): void {
    if (this.pollingSub) {
      this.pollingSub.unsubscribe();
    }
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.importForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  fetchOverview(): void {
    this.loading.set(true);
    this.error.set(null);

    this.http.get<Overview>('http://localhost:8080/api/v1/overview').subscribe({
      next: (res) => {
        this.overview.set(res);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.message || 'Connection refused');
        this.loading.set(false);
      }
    });
  }

  fetchProjects(): void {
    this.http.get<Project[]>('http://localhost:8080/api/v1/projects').subscribe({
      next: (list) => {
        this.projects.set(list);
      },
      error: (err) => {
        console.error('Failed to load projects', err);
      }
    });
  }

  fetchGithubRepos(): void {
    this.githubLoading.set(true);
    this.githubError.set(null);

    this.http.get<GithubRepo[]>('http://localhost:8080/api/v1/github/repos').subscribe({
      next: (repos) => {
        this.githubRepos.set(repos);
        this.githubLoading.set(false);
      },
      error: (err) => {
        this.githubLoading.set(false);
        this.githubError.set(err.error?.error || 'Failed to fetch repositories.');
      }
    });
  }

  connectGitHub(): void {
    this.http.get<{url: string}>('http://localhost:8080/api/v1/auth/github/login').subscribe({
      next: (res) => {
        window.location.href = res.url;
      },
      error: (err) => {
        console.error('Failed to initiate GitHub connect', err);
      }
    });
  }

  isAlreadyIngested(gitUrl: string): boolean {
    const cleanUrl = gitUrl.replace(/\.git$/, '').toLowerCase().trim();
    return this.projects().some(p => p.git_url.replace(/\.git$/, '').toLowerCase().trim() === cleanUrl);
  }

  quickIngest(repo: GithubRepo): void {
    this.isImporting.set(true);
    
    this.http.post<Project>('http://localhost:8080/api/v1/projects', {
      git_url: repo.html_url,
      branch: repo.default_branch || ''
    }).subscribe({
      next: (project) => {
        this.isImporting.set(false);
        this.projects.update(list => [project, ...list]);
        // Trigger a poll check instantly
        this.fetchProjects();
      },
      error: (err) => {
        this.isImporting.set(false);
        alert(err.error?.error || 'Failed to ingest repository.');
      }
    });
  }

  onImport(): void {
    if (this.importForm.invalid) return;

    this.isImporting.set(true);
    this.importError.set(null);

    const { git_url, branch } = this.importForm.value;

    this.http.post<Project>('http://localhost:8080/api/v1/projects', {
      git_url: git_url!,
      branch: branch || ''
    }).subscribe({
      next: (project) => {
        this.isImporting.set(false);
        this.importForm.reset();
        // Insert at start of list
        this.projects.update(list => [project, ...list]);
      },
      error: (err) => {
        this.isImporting.set(false);
        this.importError.set(err.error?.error || 'Failed to import repository.');
      }
    });
  }

  // Analyze Trigger
  analyzeProject(proj: Project): void {
    this.http.post<any>(`http://localhost:8080/api/v1/projects/${proj.id}/parse`, {}).subscribe({
      next: (res) => {
        this.projects.update(list => list.map(p => p.id === proj.id ? { ...p, status: 'PARSING' } : p));
      },
      error: (err) => {
        alert(err.error?.error || 'Failed to initiate codebase analysis.');
      }
    });
  }

  // Load Insights View
  viewInsights(proj: Project): void {
    this.selectedProjectName.set(proj.name);
    this.selectedProjectId.set(proj.id);
    this.loadingIR.set(true);
    this.errorIR.set(null);
    this.selectedProjectIR.set(null);

    // Scroll smoothly to the insights section
    setTimeout(() => {
      document.getElementById('insights-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    this.http.get<any>(`http://localhost:8080/api/v1/projects/${proj.id}/ir`).subscribe({
      next: (ir) => {
        this.selectedProjectIR.set(ir);
        this.loadingIR.set(false);
      },
      error: (err) => {
        this.loadingIR.set(false);
        this.errorIR.set(err.error?.error || 'Failed to retrieve intermediate representation.');
      }
    });
  }

  closeInsights(): void {
    this.selectedProjectIR.set(null);
    this.selectedProjectName.set('');
    this.selectedProjectId.set('');
    this.errorIR.set(null);
  }

  // Download compiled JSON file
  downloadIR(): void {
    const irData = this.selectedProjectIR();
    if (!irData) return;
    const blob = new Blob([JSON.stringify(irData, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.selectedProjectName()}-ir.json`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  // Download directly from project row
  downloadIRDirect(proj: Project): void {
    this.http.get<any>(`http://localhost:8080/api/v1/projects/${proj.id}/ir`).subscribe({
      next: (ir) => {
        const blob = new Blob([JSON.stringify(ir, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${proj.name}-ir.json`;
        link.click();
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        alert(err.error?.error || 'Failed to retrieve IR data.');
      }
    });
  }

  // Helpers
  getSymbolsCount(kind: string): number {
    const ir = this.selectedProjectIR();
    if (!ir || !ir.symbols) return 0;
    return ir.symbols.filter((s: any) => s.kind === kind).length;
  }

  getPackageFromSymbol(sym: any): string {
    const parts = sym.id.split('://');
    if (parts.length === 2) {
      const subParts = parts[1].split('/');
      if (subParts.length > 0) return subParts[0];
    }
    return 'main';
  }

  getFileName(path: string): string {
    if (!path) return '';
    const parts = path.split('/');
    return parts[parts.length - 1];
  }

  logout(): void {
    this.authService.logout();
    window.location.reload();
  }
}
