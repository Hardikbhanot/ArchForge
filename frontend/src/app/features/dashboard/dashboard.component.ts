import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription, interval, startWith, switchMap } from 'rxjs';
import { AiChatComponent } from './ai-chat/ai-chat.component';

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
  imports: [CommonModule, FormsModule, ReactiveFormsModule, DecimalPipe, AiChatComponent],
  styleUrl: "./dashboard.component.css",
  template: `
    <div class="dashboard-container">
      <div class="glow-mesh-1"></div>
      <div class="glow-mesh-2"></div>

      <header class="header">
        <div class="brand">
          <img src="logo.jpg" alt="ArchForge Logo" class="logo-image" />
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
                        <button (click)="downloadHLD(p)" class="btn-action-outline">Generate HLD</button>
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
        <app-ai-chat [projectId]="selectedProjectId() || null"></app-ai-chat>
      </main>
    </div>
  `,
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
    const parts = nodeId.split('/');
    let name = parts[parts.length - 1];

    // For Next.js / React projects, include the parent directory for generic filenames
    if (parts.length > 1) {
      const generic = ['page.tsx', 'page.jsx', 'page.ts', 'page.js', 'layout.tsx', 'layout.jsx', 'layout.ts', 'layout.js', 'route.ts', 'route.js', 'index.tsx', 'index.jsx', 'index.ts', 'index.js'];
      if (generic.includes(name.toLowerCase())) {
        name = parts[parts.length - 2] + '/' + name;
      }
    }

    return name.length > 20 ? name.substring(0, 19) + '…' : name;
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

  downloadHLD(proj: Project): void {
    // We expect a direct text/markdown download, but Angular http client needs responseType: 'text'
    this.http.get(`http://localhost:8080/api/v1/projects/${proj.id}/hld`, { responseType: 'text' }).subscribe({
      next: (hldContent) => {
        const blob = new Blob([hldContent], { type: 'text/markdown' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${proj.name}-hld.md`;
        link.click();
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        alert(err.error || 'Failed to generate HLD document.');
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
