import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="home-container">
      <div class="glow-mesh-1"></div>
      <div class="glow-mesh-2"></div>

      <!-- Navigation -->
      <nav class="navbar glass-panel animate-entry delay-100">
        <div class="brand">
          <span class="logo-icon">▲</span>
          <h1>ArchForge</h1>
        </div>
        <div class="nav-links">
          <a routerLink="/login" class="nav-link">Sign In</a>
          <a routerLink="/register" class="btn-primary">Get Started</a>
        </div>
      </nav>

      <!-- Hero Section -->
      <main class="hero-section">
        <div class="hero-content animate-entry delay-200">
          <h2 class="hero-title">
            Understand any codebase <br />
            <span class="gradient-text">instantly.</span>
          </h2>
          <p class="hero-subtitle">
            ArchForge is an AI-native architecture platform that parses your source code into
            language-agnostic intermediate representations, generating interactive dependency graphs
            and system documentation in seconds.
          </p>
          <div class="cta-group">
            <a routerLink="/register" class="btn-primary btn-lg">Start Exploring Free</a>
            <a href="https://github.com/Hardikbhanot/ArchForge" target="_blank" class="btn-secondary btn-lg">View Source</a>
          </div>
        </div>
      </main>

      <!-- Features Section -->
      <section class="features-section animate-entry delay-300">
        <div class="feature-card glass-panel">
          <div class="feature-icon">AST</div>
          <h3>Language-Agnostic Parsing</h3>
          <p>We parse your code down to its AST and abstract it into a canonical Intermediate Representation JSON.</p>
        </div>
        <div class="feature-card glass-panel">
          <div class="feature-icon">🕸️</div>
          <h3>Interactive Graphs</h3>
          <p>Visually explore your architecture. Drill down from top-level packages to individual files and symbols.</p>
        </div>
        <div class="feature-card glass-panel">
          <div class="feature-icon">🤖</div>
          <h3>AI-Generated Docs</h3>
          <p>Our LLM reads your codebase's IR and automatically writes comprehensive system documentation.</p>
        </div>
      </section>

      <!-- Footer -->
      <footer class="footer animate-entry delay-300">
        <p>&copy; 2026 ArchForge. Built for developers.</p>
      </footer>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100vw;
      min-height: 100vh;
      overflow-x: hidden;
      background: var(--bg-obsidian);
      color: var(--text-primary);
      font-family: var(--font-sans);
    }

    .home-container {
      position: relative;
      width: 100%;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      overflow-x: hidden;
    }

    .glow-mesh-1, .glow-mesh-2 {
      position: absolute;
      width: 800px;
      height: 800px;
      border-radius: 50%;
      filter: blur(140px);
      opacity: 0.15;
      pointer-events: none;
      z-index: 0;
    }

    .glow-mesh-1 {
      top: -10%;
      left: -20%;
      background: radial-gradient(circle, var(--accent-indigo) 0%, transparent 70%);
      animation: float-slow 20s infinite alternate;
    }

    .glow-mesh-2 {
      top: 30%;
      right: -20%;
      background: radial-gradient(circle, var(--accent-violet) 0%, transparent 70%);
      animation: float-slow-reverse 25s infinite alternate;
    }

    .navbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: calc(100% - 4rem);
      max-width: 1200px;
      margin-top: 1.5rem;
      padding: 1rem 2rem;
      z-index: 10;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .logo-icon {
      font-size: 1.75rem;
      color: var(--accent-indigo);
      text-shadow: 0 0 15px var(--accent-indigo-glow);
    }

    .brand h1 {
      font-size: 1.5rem;
      font-weight: 800;
      letter-spacing: -0.025em;
      margin: 0;
    }

    .nav-links {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }

    .nav-link {
      color: var(--text-secondary);
      text-decoration: none;
      font-weight: 500;
      transition: color 0.2s;
    }

    .nav-link:hover {
      color: var(--text-primary);
    }

    .btn-primary {
      padding: 0.6rem 1.25rem;
      border-radius: 8px;
      background: linear-gradient(135deg, var(--accent-indigo) 0%, var(--accent-violet) 100%);
      color: white;
      font-weight: 600;
      text-decoration: none;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 12px var(--accent-indigo-glow);
      transition: all 0.2s;
    }

    .btn-primary:hover {
      filter: brightness(1.1);
      transform: translateY(-1px);
      box-shadow: 0 8px 20px var(--accent-violet-glow);
    }

    .btn-secondary {
      padding: 0.6rem 1.25rem;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-subtle);
      color: var(--text-primary);
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s;
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: var(--border-highlight);
    }

    .hero-section {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 6rem 2rem;
      z-index: 10;
      max-width: 900px;
    }

    .hero-title {
      font-size: 4.5rem;
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: -0.04em;
      margin-bottom: 1.5rem;
    }

    .gradient-text {
      background: linear-gradient(135deg, #a78bfa 0%, #60a5fa 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      text-shadow: 0 0 30px rgba(99, 102, 241, 0.3);
    }

    .hero-subtitle {
      font-size: 1.25rem;
      color: var(--text-secondary);
      max-width: 700px;
      margin: 0 auto 2.5rem;
      line-height: 1.6;
    }

    .cta-group {
      display: flex;
      gap: 1rem;
      justify-content: center;
    }

    .btn-lg {
      padding: 0.875rem 1.75rem;
      font-size: 1.125rem;
    }

    .features-section {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 2rem;
      width: calc(100% - 4rem);
      max-width: 1200px;
      margin-bottom: 6rem;
      z-index: 10;
    }

    .feature-card {
      padding: 2.5rem 2rem;
      text-align: left;
      transition: transform 0.2s;
    }

    .feature-card:hover {
      transform: translateY(-5px);
      border-color: var(--border-highlight);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    }

    .feature-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 3rem;
      height: 3rem;
      background: rgba(99, 102, 241, 0.15);
      color: var(--accent-indigo);
      border-radius: 12px;
      font-weight: 800;
      font-size: 1.25rem;
      margin-bottom: 1.5rem;
      border: 1px solid rgba(99, 102, 241, 0.3);
    }

    .feature-card h3 {
      font-size: 1.25rem;
      margin-bottom: 0.75rem;
    }

    .feature-card p {
      color: var(--text-secondary);
      font-size: 0.9375rem;
      line-height: 1.6;
      margin: 0;
    }

    .footer {
      width: 100%;
      text-align: center;
      padding: 2rem;
      color: var(--text-muted);
      font-size: 0.875rem;
      border-top: 1px solid var(--border-subtle);
      z-index: 10;
    }

    @keyframes float-slow {
      from { transform: translate(0, 0); }
      to { transform: translate(40px, 40px); }
    }

    @keyframes float-slow-reverse {
      from { transform: translate(0, 0); }
      to { transform: translate(-40px, -40px); }
    }
  `]
})
export class HomeComponent {}
