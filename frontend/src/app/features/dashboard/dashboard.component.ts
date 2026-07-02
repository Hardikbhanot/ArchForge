import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
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
  imports: [CommonModule, FormsModule, ReactiveFormsModule, DecimalPipe],
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
        <section class="glass-panel github-repos-card animate-entry delay-100">
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
              <div class="skeleton-text" style="height: 48px; width: 100%; margin-bottom: 0.75rem;"></div>
              <div class="skeleton-text" style="height: 48px; width: 100%; margin-bottom: 0.75rem;"></div>
              <div class="skeleton-text" style="height: 48px; width: 100%;"></div>
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
        <section class="glass-panel import-card animate-entry delay-200">
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
                <div class="project-row glass-panel animate-entry" [class.status-failed]="p.status === 'FAILED'">
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
                    <div class="action-btn-row">
                      @if (p.status === 'FAILED') {
                        <p class="error-desc">{{ p.error || 'Cloning task terminated unexpectedly' }}</p>
                        <button (click)="analyzeProject(p)" class="btn-action-primary">Re-Analyze</button>
                      } @else if (p.status === 'COMPLETED') {
                        <button (click)="analyzeProject(p)" class="btn-action-primary">Analyze Codebase</button>
                      } @else if (p.status === 'PARSING') {
                        <p class="parsing-desc">Extracting AST symbols...</p>
                      } @else if (p.status === 'PARSED') {
                        <button (click)="viewInsights(p)" class="btn-action-success">View Insights</button>
                        <button (click)="downloadIRDirect(p)" class="btn-action-outline">Download IR</button>
                      } @else {
                        <p class="cloning-desc">Running git clone on server...</p>
                      }

                      <button 
                        (click)="deleteProject(p)" 
                        [disabled]="isImporting() || p.status === 'CLONING' || p.status === 'PARSING'" 
                        class="btn-action-delete"
                      >
                        Delete
                      </button>
                    </div>
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
          <section class="glass-panel insights-card animate-entry delay-200" id="insights-panel">
            <div class="insights-header">
              <div class="insights-title-row">
                <h3>Codebase Insights: {{ selectedProjectName() }}</h3>
                <span class="badge">IR Version {{ selectedProjectIR()?.schemaVersion || '1.0' }}</span>
              </div>
              <button (click)="closeInsights()" class="btn-close">×</button>
            </div>

            @if (loadingIR()) {
              <div class="insights-loading">
                <div class="skeleton-text" style="height: 80px; width: 100%; margin-bottom: 1.5rem;"></div>
                <div class="skeleton-text" style="height: 250px; width: 100%;"></div>
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

              <!-- Tab Selector -->
              <div class="insights-tabs" role="tablist">
                <button 
                  role="tab"
                  [class.active]="insightsTab() === 'symbols'"
                  (click)="setInsightsTab('symbols')" 
                  id="tab-symbols"
                  class="tab-btn"
                >Symbol Explorer</button>
                <button 
                  role="tab"
                  [class.active]="insightsTab() === 'graph'"
                  (click)="setInsightsTab('graph')" 
                  id="tab-graph"
                  class="tab-btn"
                >Architecture Graph</button>
                <button 
                  role="tab"
                  [class.active]="insightsTab() === 'docs'"
                  (click)="setInsightsTab('docs')" 
                  id="tab-docs"
                  class="tab-btn"
                >System Documentation</button>
              </div>

              <!-- ============ TAB: Symbol Explorer ============ -->
              @if (insightsTab() === 'symbols') {
                <div class="explorer-section">
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
              }

              <!-- ============ TAB: Architecture Graph ============ -->
              @if (insightsTab() === 'graph') {
                <div class="graph-tab-content">
                  @if (loadingGraph()) {
                    <div class="insights-loading">
                      <div class="skeleton-text" style="height: 40px; width: 200px; margin-bottom: 1rem;"></div>
                      <div class="skeleton-text" style="height: 400px; width: 100%; border-radius: 16px;"></div>
                    </div>
                  } @else if (graphData()) {
                    <!-- Graph Controls -->
                    <div class="graph-controls">
                      <button (click)="graphZoomIn()" class="graph-ctrl-btn" title="Zoom In">＋</button>
                      <button (click)="graphZoomOut()" class="graph-ctrl-btn" title="Zoom Out">－</button>
                      <button (click)="graphResetView()" class="graph-ctrl-btn" title="Reset View">⊙</button>
                      <span class="graph-zoom-label">{{ (graphZoom() * 100) | number:'1.0-0' }}%</span>
                      <!-- Breadcrumb -->
                      <span class="graph-breadcrumb">
                        <span (click)="drillBack()" [class.graph-breadcrumb-link]="graphPkg()">All Packages</span>
                        @if (graphPkg()) {
                          <span class="graph-breadcrumb-sep">›</span>
                          <span class="graph-breadcrumb-current">{{ graphPkg() }}</span>
                          <button (click)="drillBack()" class="graph-ctrl-btn graph-back-btn">← Back</button>
                        }
                      </span>
                      @if (highlightedNode()) {
                        <span class="graph-selected-label">{{ graphPkg() ? '📄' : '📦' }} {{ getNodeShortName(highlightedNode()!) }}</span>
                        <button (click)="highlightedNode.set(null)" class="graph-ctrl-btn">✕ Clear</button>
                      }
                    </div>

                    <!-- SVG Graph Container -->
                    <div 
                      class="graph-viewport"
                      (wheel)="onGraphWheel($event)"
                      (mousedown)="onGraphMouseDown($event)"
                      (mousemove)="onGraphMouseMove($event)"
                      (mouseup)="onGraphMouseUp()"
                      (mouseleave)="onGraphMouseUp()"
                    >
                      <svg 
                        class="graph-svg"
                        [attr.width]="graphSvgWidth"
                        [attr.height]="graphSvgHeight"
                        id="arch-graph-svg"
                      >
                        <!-- Arrow marker defs -->
                        <defs>
                          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                            <path d="M0,0 L0,6 L8,3 z" fill="rgba(99,102,241,0.7)"/>
                          </marker>
                          <marker id="arrow-hi" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                            <path d="M0,0 L0,6 L8,3 z" fill="#a78bfa"/>
                          </marker>
                          <filter id="glow-filter">
                            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                          </filter>
                        </defs>

                        <g [attr.transform]="'translate(' + graphPanX() + ',' + graphPanY() + ') scale(' + graphZoom() + ')'">
                          <!-- Edges -->
                          @for (edge of graphData()?.edges; track edge.source + edge.target) {
                            <line
                              [attr.x1]="getNodePos(edge.source)?.x"
                              [attr.y1]="getNodePos(edge.source)?.y"
                              [attr.x2]="getNodePos(edge.target)?.x"
                              [attr.y2]="getNodePos(edge.target)?.y"
                              [class.edge-hi]="highlightedNode() === edge.source || highlightedNode() === edge.target"
                              class="graph-edge"
                              [attr.marker-end]="(highlightedNode() === edge.source || highlightedNode() === edge.target) ? 'url(#arrow-hi)' : 'url(#arrow)'"
                            />
                          }

                          <!-- Nodes -->
                          @for (node of graphData()?.nodes; track node.id) {
                            <g 
                              class="graph-node-group"
                              [class.node-hi]="highlightedNode() === node.id"
                              [class.node-external]="node.kind === 'external'"
                              [attr.transform]="'translate(' + getNodePos(node.id)?.x + ',' + getNodePos(node.id)?.y + ')'"
                              (click)="highlightedNode.set(highlightedNode() === node.id ? null : node.id)"
                            >
                              <circle 
                                [attr.r]="node.kind === 'external' ? 34 : 42"
                                class="node-bg"
                                [class.node-bg-hi]="highlightedNode() === node.id"
                                [class.node-bg-ext]="node.kind === 'external'"
                              />
                              <circle 
                                [attr.r]="node.kind === 'external' ? 34 : 42"
                                class="node-ring"
                                [class.node-ring-hi]="highlightedNode() === node.id"
                                [class.node-ring-ext]="node.kind === 'external'"
                              />
                              <text class="node-label" text-anchor="middle" dominant-baseline="middle">{{ getNodeShortName(node.id) }}</text>
                              <text class="node-sub" text-anchor="middle" dominant-baseline="middle" dy="16">{{ node.kind === 'file' ? 'file' : node.kind === 'external' ? 'pkg' : (node.file_count ? node.file_count + ' files' : 'pkg') }}</text>
                            </g>
                          }
                        </g>
                      </svg>
                    </div>

                    <!-- Graph Legend -->
                    <div class="graph-legend">
                      @if (graphPkg()) {
                        <span class="legend-item"><span class="legend-dot node"></span> File</span>
                        <span class="legend-item"><span class="legend-dot ext"></span> External pkg</span>
                      } @else {
                        <span class="legend-item"><span class="legend-dot node"></span> Package</span>
                      }
                      <span class="legend-item"><span class="legend-dot edge"></span> Imports</span>
                      <span class="legend-hint">Click a node to highlight · Double-click package to drill in · Scroll to zoom · Drag to pan</span>
                    </div>

                    <!-- Node Detail Panel -->
                    @if (highlightedNode()) {
                      <div class="node-detail-panel animate-fade-in">
                        <div class="node-detail-header">
                          <h5>{{ getHighlightedNodeKind() === 'file' ? '📄' : getHighlightedNodeKind() === 'external' ? '📦' : '📦' }} {{ getNodeShortName(highlightedNode()!) }}</h5>
                          @if (getHighlightedNodeKind() === 'package') {
                            <button class="btn-drill-in" (dblclick)="drillInto(highlightedNode()!)" (click)="drillInto(highlightedNode()!)">Explore files →</button>
                          }
                        </div>
                        <div class="node-detail-body">
                          <div class="detail-col">
                            <p class="detail-label">Imports</p>
                            @if (getNodeDependsOn(highlightedNode()!).length > 0) {
                              <ul class="dep-list">
                                @for (dep of getNodeDependsOn(highlightedNode()!); track dep) {
                                  <li (click)="highlightedNode.set(dep)" class="dep-item">{{ getNodeShortName(dep) }}</li>
                                }
                              </ul>
                            } @else {
                              <p class="dep-none">No outgoing dependencies</p>
                            }
                          </div>
                          <div class="detail-col">
                            <p class="detail-label">Imported by</p>
                            @if (getNodeUsedBy(highlightedNode()!).length > 0) {
                              <ul class="dep-list">
                                @for (u of getNodeUsedBy(highlightedNode()!); track u) {
                                  <li (click)="highlightedNode.set(u)" class="dep-item">{{ getNodeShortName(u) }}</li>
                                }
                              </ul>
                            } @else {
                              <p class="dep-none">No incoming dependencies</p>
                            }
                          </div>
                        </div>
                      </div>
                    }
                  } @else {
                    <div class="empty-state-sm">
                      <p>No package dependency data found. Ensure the project has been parsed successfully.</p>
                    </div>
                  }
                </div>
              }

              <!-- ============ TAB: System Documentation ============ -->
              @if (insightsTab() === 'docs') {
                <div class="docs-tab-content">
                  @if (loadingDocs()) {
                    <div class="insights-loading">
                      <div class="skeleton-text" style="height: 40px; width: 200px; margin-bottom: 1rem;"></div>
                      <div class="skeleton-text" style="height: 400px; width: 100%; border-radius: 16px;"></div>
                    </div>
                  } @else if (docsMarkdown()) {
                    <div class="docs-actions-row">
                      <button (click)="downloadDocs()" class="btn-download-docs">⬇ Download Markdown</button>
                    </div>
                    <div class="docs-viewer" [innerHTML]="parsedDocsHtml()"></div>
                  } @else {
                    <div class="empty-state-sm">
                      <p>No documentation generated yet. Ensure the project has been parsed successfully.</p>
                    </div>
                  }
                </div>
              }

              <div class="insights-actions">
                <button (click)="downloadIR()" class="btn-download-ir">Download Canonical IR JSON</button>
              </div>
            }
          </section>
        }

        <!-- Overview details -->
        @if (overview()) {
          <div class="grid-layout">
            <div class="glass-panel overview-card animate-entry delay-300">
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

            <div class="glass-panel features-card animate-entry delay-300">
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
      /* Background and font handled by global styles */
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
      background: radial-gradient(circle, var(--accent-indigo) 0%, transparent 70%);
    }

    .glow-mesh-2 {
      bottom: -10%;
      right: -10%;
      background: radial-gradient(circle, var(--accent-violet) 0%, transparent 70%);
    }

    .header {
      position: relative;
      z-index: 1;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem 3rem;
      border-bottom: 1px solid var(--border-subtle);
      background: rgba(15, 23, 42, 0.4);
      backdrop-filter: blur(16px);
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

    .btn-action-delete {
      padding: 0.5rem 1rem;
      border-radius: 8px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.25);
      color: #fca5a5;
      font-weight: 650;
      font-size: 0.8125rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-action-delete:hover:not(:disabled) {
      background: #ef4444;
      color: white;
      border-color: #ef4444;
      box-shadow: 0 4px 10px rgba(239, 68, 68, 0.25);
    }

    .btn-action-delete:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      border-color: rgba(255, 255, 255, 0.05);
      background: rgba(255, 255, 255, 0.02);
      color: #64748b;
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
      font-family: var(--font-mono);
      font-weight: 500;
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
      font-family: var(--font-mono);
    }

    .file-path-col {
      font-size: 0.8125rem;
      color: #64748b;
      font-family: var(--font-mono);
    }

    /* === Insight Tabs === */
    .insights-tabs {
      display: inline-flex;
      gap: 0.25rem;
      margin-bottom: 1.75rem;
      background: rgba(15, 23, 42, 0.4);
      padding: 0.35rem;
      border-radius: 12px;
      border: 1px solid var(--border-subtle);
    }

    .tab-btn {
      padding: 0.5rem 1.25rem;
      border-radius: 8px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .tab-btn:hover {
      color: var(--text-primary);
      background: rgba(255,255,255,0.05);
    }

    .tab-btn.active {
      color: var(--text-primary);
      background: var(--accent-indigo);
      box-shadow: 0 2px 8px var(--accent-indigo-glow);
    }


    /* === Architecture Graph === */
    .graph-tab-content {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .graph-controls {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .graph-ctrl-btn {
      padding: 0.4rem 0.75rem;
      border-radius: 8px;
      border: 1px solid rgba(139,92,246,0.3);
      background: rgba(139,92,246,0.08);
      color: #a78bfa;
      font-size: 1rem;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
      font-weight: 600;
    }

    .graph-ctrl-btn:hover {
      background: rgba(139,92,246,0.2);
      border-color: rgba(139,92,246,0.5);
    }

    .graph-breadcrumb {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: #94a3b8;
      margin-left: 0.5rem;
    }

    .graph-breadcrumb-link {
      cursor: pointer;
      color: #a78bfa;
      transition: color 0.2s;
    }

    .graph-breadcrumb-link:hover {
      color: #c4b5fd;
      text-decoration: underline;
    }

    .graph-breadcrumb-sep {
      color: #475569;
    }

    .graph-breadcrumb-current {
      color: #f1f5f9;
      font-weight: 600;
    }

    .graph-back-btn {
      padding: 0.25rem 0.5rem;
      font-size: 0.75rem;
      margin-left: 0.5rem;
    }

    .graph-zoom-label {
      font-size: 0.8125rem;
      color: #64748b;
      font-variant-numeric: tabular-nums;
      min-width: 42px;
    }

    .graph-selected-label {
      font-size: 0.8125rem;
      color: #a78bfa;
      font-weight: 600;
      background: rgba(139,92,246,0.12);
      padding: 0.25rem 0.75rem;
      border-radius: 99px;
      border: 1px solid rgba(139,92,246,0.25);
    }

    .graph-viewport {
      width: 100%;
      height: 500px;
      border: 1px solid rgba(139,92,246,0.15);
      border-radius: 16px;
      overflow: hidden;
      background: radial-gradient(ellipse at 50% 50%, rgba(139,92,246,0.04) 0%, transparent 70%), #080f1f;
      cursor: grab;
      position: relative;
    }

    .graph-viewport:active { cursor: grabbing; }

    .graph-svg {
      display: block;
    }

    .graph-edge {
      stroke: rgba(99,102,241,0.35);
      stroke-width: 1.5;
      transition: stroke 0.2s, stroke-width 0.2s;
    }

    .graph-edge.edge-hi {
      stroke: rgba(167,139,250,0.75);
      stroke-width: 2.5;
    }

    .graph-node-group {
      cursor: pointer;
      transition: transform 0.15s;
    }

    .graph-node-group:hover .node-bg { opacity: 0.9; }

    .node-bg {
      fill: rgba(15,23,42,0.9);
      stroke: none;
    }

    .node-ring {
      fill: none;
      stroke: rgba(99,102,241,0.5);
      stroke-width: 1.5;
      transition: stroke 0.2s, stroke-width 0.2s;
    }

    .node-ring.node-ring-hi {
      stroke: #a78bfa;
      stroke-width: 2.5;
      filter: url(#glow-filter);
    }

    .node-bg.node-bg-hi {
      fill: rgba(139,92,246,0.12);
    }

    .node-bg-ext {
      fill: rgba(30,41,59,0.9);
    }

    .node-ring-ext {
      stroke: rgba(100,116,139,0.5);
      stroke-dasharray: 4 2;
    }

    .node-ring.node-ring-ext.node-ring-hi {
      stroke: #94a3b8;
    }

    .node-label {
      fill: #e2e8f0;
      font-size: 11px;
      font-weight: 700;
      font-family: 'Outfit','Inter',sans-serif;
      pointer-events: none;
      dy: -6px;
    }

    .node-sub {
      fill: #64748b;
      font-size: 9px;
      font-family: 'Outfit','Inter',sans-serif;
      pointer-events: none;
    }

    .graph-legend {
      display: flex;
      align-items: center;
      gap: 1.25rem;
      font-size: 0.8125rem;
      color: #64748b;
      flex-wrap: wrap;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
    }

    .legend-dot.node {
      background: rgba(99,102,241,0.6);
      border: 1.5px solid rgba(99,102,241,0.9);
    }

    .legend-dot.ext {
      background: rgba(100,116,139,0.6);
      border: 1.5px dashed rgba(100,116,139,0.9);
    }

    .legend-dot.edge {
      width: 20px;
      height: 2px;
      border-radius: 0;
      background: rgba(99,102,241,0.6);
    }

    .legend-hint {
      color: #475569;
      font-size: 0.75rem;
      margin-left: auto;
    }

    .node-detail-panel {
      background: rgba(139,92,246,0.06);
      border: 1px solid rgba(139,92,246,0.2);
      border-radius: 14px;
      padding: 1.25rem 1.5rem;
    }

    .node-detail-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .node-detail-panel h5 {
      margin: 0;
      font-size: 1rem;
      font-weight: 700;
      color: #c4b5fd;
    }

    .btn-drill-in {
      background: rgba(139,92,246,0.15);
      border: 1px solid rgba(139,92,246,0.4);
      color: #c4b5fd;
      border-radius: 6px;
      padding: 0.35rem 0.75rem;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-drill-in:hover {
      background: rgba(139,92,246,0.25);
      border-color: #a78bfa;
    }

    .node-detail-body {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
    }

    .detail-label {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: #64748b;
      margin: 0 0 0.5rem;
    }

    .dep-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    .dep-item {
      font-size: 0.8125rem;
      color: #a78bfa;
      cursor: pointer;
      padding: 0.25rem 0.5rem;
      border-radius: 6px;
      transition: background 0.15s;
    }

    .dep-item:hover {
      background: rgba(139,92,246,0.12);
    }

    .dep-none {
      font-size: 0.8125rem;
      color: #475569;
      margin: 0;
    }

    /* === Documentation Viewer === */
    .docs-tab-content {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .docs-actions-row {
      display: flex;
      justify-content: flex-end;
    }

    .btn-download-docs {
      padding: 0.5rem 1.125rem;
      border-radius: 9px;
      border: 1px solid rgba(16,185,129,0.3);
      background: rgba(16,185,129,0.08);
      color: #34d399;
      font-size: 0.8125rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
    }

    .btn-download-docs:hover {
      background: rgba(16,185,129,0.18);
      border-color: rgba(16,185,129,0.5);
    }

    .docs-viewer {
      background: rgba(15,23,42,0.5);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 14px;
      padding: 2rem 2.5rem;
      line-height: 1.7;
      max-height: 560px;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: rgba(139,92,246,0.3) transparent;
    }

    .docs-viewer :is(h1,h2,h3,h4) { color: #f1f5f9; margin: 1.25em 0 0.5em; }
    .docs-viewer h1 { font-size: 1.5rem; font-weight: 800; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 0.4em; }
    .docs-viewer h2 { font-size: 1.25rem; font-weight: 750; }
    .docs-viewer h3 { font-size: 1.05rem; font-weight: 700; color: #a78bfa; }
    .docs-viewer h4 { font-size: 0.95rem; font-weight: 700; color: #94a3b8; }
    .docs-viewer p { color: #94a3b8; margin: 0.5em 0; }
    .docs-viewer strong { color: #e2e8f0; }
    .docs-viewer em { color: #c4b5fd; }
    .docs-viewer code {
      background: rgba(99,102,241,0.12);
      color: #a5b4fc;
      padding: 0.1em 0.4em;
      border-radius: 4px;
      font-family: 'Fira Code', monospace;
      font-size: 0.875em;
    }
    .docs-viewer pre {
      background: rgba(15,23,42,0.8);
      border: 1px solid rgba(99,102,241,0.2);
      border-radius: 10px;
      padding: 1rem 1.25rem;
      overflow-x: auto;
      margin: 1em 0;
    }
    .docs-viewer pre code { background: transparent; padding: 0; }
    .docs-viewer ul, .docs-viewer ol { color: #94a3b8; padding-left: 1.5em; margin: 0.5em 0; }
    .docs-viewer li { margin: 0.25em 0; }
    .docs-viewer table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
      margin: 1em 0;
    }
    .docs-viewer th {
      background: rgba(99,102,241,0.12);
      color: #a5b4fc;
      padding: 0.5rem 0.75rem;
      text-align: left;
      font-weight: 700;
      border: 1px solid rgba(99,102,241,0.2);
    }
    .docs-viewer td {
      padding: 0.5rem 0.75rem;
      color: #94a3b8;
      border: 1px solid rgba(255,255,255,0.05);
    }
    .docs-viewer tr:nth-child(even) td { background: rgba(255,255,255,0.015); }
    .docs-viewer blockquote {
      border-left: 3px solid rgba(139,92,246,0.5);
      padding-left: 1rem;
      margin: 0.75em 0;
      color: #64748b;
      font-style: italic;
    }
    .docs-viewer hr {
      border: none;
      border-top: 1px solid rgba(255,255,255,0.07);
      margin: 1.5em 0;
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
  private sanitizer = inject(DomSanitizer);

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

  // Insights Tabs
  insightsTab = signal<'symbols' | 'graph' | 'docs'>('symbols');

  // Architecture Graph signals
  graphData = signal<{ nodes: any[]; edges: any[] } | null>(null);
  loadingGraph = signal(false);
  graphZoom = signal(1);
  graphPanX = signal(0);
  graphPanY = signal(0);
  highlightedNode = signal<string | null>(null);
  graphPkg = signal<string | null>(null); // null = package-level view, string = file-level drill-in
  graphSvgWidth = 900;
  graphSvgHeight = 500;
  private _graphDragging = false;
  private _graphLastMouse = { x: 0, y: 0 };

  // Reactive node positions — recomputed whenever graphData changes
  nodePositions = computed(() => {
    const data = this.graphData();
    const positions = new Map<string, { x: number; y: number }>();
    if (!data?.nodes?.length) return positions;
    const n = data.nodes.length;
    const cx = this.graphSvgWidth / 2;
    const cy = this.graphSvgHeight / 2;
    const radius = Math.min(cx, cy) - 65;
    if (n === 1) {
      positions.set(data.nodes[0].id, { x: cx, y: cy });
      return positions;
    }
    data.nodes.forEach((node: any, i: number) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      positions.set(node.id, {
        x: Math.round(cx + radius * Math.cos(angle)),
        y: Math.round(cy + radius * Math.sin(angle))
      });
    });
    return positions;
  });

  // Documentation signals
  docsMarkdown = signal<string | null>(null);
  loadingDocs = signal(false);

  parsedDocsHtml = computed((): SafeHtml => {
    const md = this.docsMarkdown();
    if (!md) return '';
    return this.sanitizer.bypassSecurityTrustHtml(this.parseMd(md));
  });

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
    this.insightsTab.set('symbols');
    this.graphData.set(null);
    this.docsMarkdown.set(null);
    this.highlightedNode.set(null);
    this.graphPkg.set(null);
    this.graphZoom.set(1);
    this.graphPanX.set(0);
    this.graphPanY.set(0);

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

  setInsightsTab(tab: 'symbols' | 'graph' | 'docs'): void {
    this.insightsTab.set(tab);
    if (tab === 'graph' && !this.graphData() && !this.loadingGraph()) {
      this.loadGraph();
    }
    if (tab === 'docs' && !this.docsMarkdown() && !this.loadingDocs()) {
      this.loadDocs();
    }
  }

  loadGraph(pkg: string | null = null): void {
    const id = this.selectedProjectId();
    if (!id) return;
    this.loadingGraph.set(true);
    let url = `http://localhost:8080/api/v1/projects/${id}/graph`;
    if (pkg) {
      url += `?pkg=${encodeURIComponent(pkg)}`;
    }
    this.http.get<any>(url).subscribe({
      next: (data) => {
        this.graphData.set(data);
        this.loadingGraph.set(false);
      },
      error: () => {
        this.loadingGraph.set(false);
        this.graphData.set({ nodes: [], edges: [] });
      }
    });
  }

  drillInto(pkg: string): void {
    this.graphPkg.set(pkg);
    this.highlightedNode.set(null);
    this.graphResetView();
    this.loadGraph(pkg);
  }

  drillBack(): void {
    if (!this.graphPkg()) return;
    this.graphPkg.set(null);
    this.highlightedNode.set(null);
    this.graphResetView();
    this.loadGraph();
  }

  getHighlightedNodeKind(): string {
    const id = this.highlightedNode();
    if (!id) return '';
    const node = this.graphData()?.nodes?.find((n: any) => n.id === id);
    return node ? node.kind : '';
  }

  getNodePos(nodeId: string): { x: number; y: number } | undefined {
    return this.nodePositions().get(nodeId);
  }

  getNodeShortName(nodeId: string): string {
    // Truncate long package paths for display
    const parts = nodeId.split('/');
    const last = parts[parts.length - 1];
    return last.length > 12 ? last.substring(0, 11) + '…' : last;
  }

  getNodeDependsOn(nodeId: string): string[] {
    const edges = this.graphData()?.edges || [];
    return edges.filter((e: any) => e.source === nodeId).map((e: any) => e.target);
  }

  getNodeUsedBy(nodeId: string): string[] {
    const edges = this.graphData()?.edges || [];
    return edges.filter((e: any) => e.target === nodeId).map((e: any) => e.source);
  }

  graphZoomIn(): void { this.graphZoom.update(z => Math.min(z + 0.15, 3)); }
  graphZoomOut(): void { this.graphZoom.update(z => Math.max(z - 0.15, 0.3)); }
  graphResetView(): void { this.graphZoom.set(1); this.graphPanX.set(0); this.graphPanY.set(0); }

  onGraphWheel(e: WheelEvent): void {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    this.graphZoom.update(z => Math.min(3, Math.max(0.3, z + delta)));
  }

  onGraphMouseDown(e: MouseEvent): void {
    this._graphDragging = true;
    this._graphLastMouse = { x: e.clientX, y: e.clientY };
  }

  onGraphMouseMove(e: MouseEvent): void {
    if (!this._graphDragging) return;
    const dx = e.clientX - this._graphLastMouse.x;
    const dy = e.clientY - this._graphLastMouse.y;
    this.graphPanX.update(v => v + dx);
    this.graphPanY.update(v => v + dy);
    this._graphLastMouse = { x: e.clientX, y: e.clientY };
  }

  onGraphMouseUp(): void {
    this._graphDragging = false;
  }

  loadDocs(): void {
    const id = this.selectedProjectId();
    if (!id) return;
    this.loadingDocs.set(true);
    this.http.get<any>(`http://localhost:8080/api/v1/projects/${id}/docs`).subscribe({
      next: (data) => {
        this.docsMarkdown.set(data.markdown || data.content || JSON.stringify(data));
        this.loadingDocs.set(false);
      },
      error: () => {
        this.loadingDocs.set(false);
        this.docsMarkdown.set('');
      }
    });
  }

  downloadDocs(): void {
    const md = this.docsMarkdown();
    if (!md) return;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.selectedProjectName()}-architecture.md`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  parseMd(md: string): string {
    let html = md
      // escape HTML
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      // fenced code blocks
      .replace(/```([\w]*)\n([\s\S]*?)```/gm, (_: string, lang: string, code: string) =>
        `<pre><code class="lang-${lang}">${code}</code></pre>`)
      // inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // headings
      .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      // bold & italic
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // horizontal rule
      .replace(/^---+$/gm, '<hr>')
      // blockquote
      .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
      // unordered lists
      .replace(/^[*\-] (.+)$/gm, '<li>$1</li>')
      // ordered lists
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
      // tables: header row
      .replace(/^\|(.+)\|$/gm, (line: string) => {
        const cols = line.split('|').slice(1, -1).map(c => c.trim());
        if (cols.every(c => /^[-:]+$/.test(c))) return '<tr-sep>';
        return '<tr>' + cols.map((c: string) => `<td>${c}</td>`).join('') + '</tr>';
      })
      // wrap consecutive <li> in <ul>
      .replace(/(<li>.*<\/li>\n?)+/gs, (m: string) => `<ul>${m}</ul>`)
      // wrap table rows
      .replace(/(<tr>.*<\/tr>\n?)+(<tr-sep>\n?)?/gs, (m: string) => {
        const rows = m.replace(/<tr-sep>\n?/g, '').trim();
        if (!rows) return '';
        const allRows = rows.split('</tr>').filter((r: string) => r.trim());
        const header = allRows.shift()!.replace('<tr>', '') + '</tr>';
        const body = allRows.map((r: string) => r.trim() + '</tr>').join('');
        const hRow = header.replace(/<td>/g, '<th>').replace(/<\/td>/g, '</th>');
        return `<table><thead><tr>${hRow}</thead><tbody>${body}</tbody></table>`;
      })
      // paragraphs (double newline)
      .replace(/\n\n(?!<[uo]l|<pre|<h|<hr|<bl|<ta)/g, '</p><p>')
      .replace(/^(?!<[houpt])(.+)$/gm, (line: string) => {
        if (line.startsWith('<') || line.trim() === '') return line;
        return line;
      });
    return `<p>${html}</p>`
      .replace(/<p><\/p>/g, '')
      .replace(/<p>(<[hH]\d)/g, '$1')
      .replace(/(<\/h\d>)<\/p>/g, '$1')
      .replace(/<p>(<ul)/g, '$1')
      .replace(/(<\/ul>)<\/p>/g, '$1')
      .replace(/<p>(<pre)/g, '$1')
      .replace(/(<\/pre>)<\/p>/g, '$1')
      .replace(/<p>(<hr>)<\/p>/g, '$1')
      .replace(/<p>(<table)/g, '$1')
      .replace(/(<\/table>)<\/p>/g, '$1')
      .replace(/<p>(<blockquote)/g, '$1')
      .replace(/(<\/blockquote>)<\/p>/g, '$1');
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

  deleteProject(proj: Project): void {
    if (!confirm(`Are you sure you want to permanently delete repository "${proj.name}" and all of its parsed insights?`)) {
      return;
    }

    this.http.delete<any>(`http://localhost:8080/api/v1/projects/${proj.id}`).subscribe({
      next: () => {
        this.projects.update(list => list.filter(p => p.id !== proj.id));
        if (this.selectedProjectId() === proj.id) {
          this.closeInsights();
        }
      },
      error: (err) => {
        alert(err.error?.error || 'Failed to delete repository.');
      }
    });
  }

  logout(): void {
    this.authService.logout();
    window.location.reload();
  }
}
