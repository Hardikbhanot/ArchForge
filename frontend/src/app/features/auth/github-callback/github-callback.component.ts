import { environment } from "../../../../environments/environment";

import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../core/services/auth.service';

interface AuthResponse {
  token: string;
  user: any;
}

@Component({
  selector: 'app-github-callback',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="callback-container">
      <div class="glow-mesh-1"></div>
      <div class="glow-mesh-2"></div>

      <div class="glass-card">
        @if (error()) {
          <div class="state-container error animate-fade-in">
            <span class="icon">⚠</span>
            <h2>Authentication Failed</h2>
            <p>{{ error() }}</p>
            <button class="btn-retry" routerLink="/login">Back to Login</button>
          </div>
        } @else {
          <div class="state-container loading">
            <span class="spinner"></span>
            <h2>Connecting GitHub</h2>
            <p>Exchanging credentials and verifying your account details...</p>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .callback-container {
      position: relative;
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100vw;
      height: 100vh;
      background: radial-gradient(circle at center, #0f172a 0%, #020617 100%);
      font-family: 'Outfit', 'Inter', sans-serif;
      color: #f1f5f9;
      overflow: hidden;
    }

    .glow-mesh-1, .glow-mesh-2 {
      position: absolute;
      width: 600px;
      height: 600px;
      border-radius: 50%;
      filter: blur(120px);
      opacity: 0.15;
      pointer-events: none;
      z-index: 0;
    }

    .glow-mesh-1 {
      top: -10%;
      left: -10%;
      background: radial-gradient(circle, #3b82f6 0%, transparent 70%);
      animation: float-slow 20s infinite alternate;
    }

    .glow-mesh-2 {
      bottom: -10%;
      right: -10%;
      background: radial-gradient(circle, #8b5cf6 0%, transparent 70%);
      animation: float-slow-reverse 25s infinite alternate;
    }

    .glass-card {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 440px;
      padding: 3.5rem 2.5rem;
      border-radius: 24px;
      background: rgba(15, 23, 42, 0.45);
      backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      text-align: center;
    }

    .state-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
    }

    .icon {
      font-size: 3rem;
      color: #ef4444;
      text-shadow: 0 0 20px rgba(239, 68, 68, 0.4);
    }

    h2 {
      font-size: 1.5rem;
      font-weight: 800;
      margin: 0;
    }

    p {
      font-size: 0.9375rem;
      color: #94a3b8;
      line-height: 1.6;
      margin: 0;
    }

    .spinner {
      width: 2.5rem;
      height: 2.5rem;
      border: 3px solid rgba(59, 130, 246, 0.1);
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      filter: drop-shadow(0 0 10px rgba(59, 130, 246, 0.3));
    }

    .btn-retry {
      margin-top: 1rem;
      padding: 0.75rem 1.5rem;
      border-radius: 12px;
      background: #1e293b;
      color: #f1f5f9;
      font-weight: 600;
      border: 1px solid rgba(255, 255, 255, 0.1);
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-retry:hover {
      background: #334155;
      border-color: rgba(255, 255, 255, 0.2);
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @keyframes float-slow {
      from { transform: translate(0, 0); }
      to { transform: translate(40px, 40px); }
    }

    @keyframes float-slow-reverse {
      from { transform: translate(0, 0); }
      to { transform: translate(-40px, -40px); }
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
export class GithubCallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  error = signal<string | null>(null);

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const code = params['code'];
      if (!code) {
        this.error.set('No authorization code returned from GitHub.');
        return;
      }
      this.exchangeCode(code);
    });
  }

  private exchangeCode(code: string): void {
    this.http.get<AuthResponse>(`${environment.apiUrl}/auth/github/callback?code=${code}`).subscribe({
      next: (res) => {
        this.authService.handleAuthentication(res.token, res.user);
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Failed to authenticate with GitHub.');
      }
    });
  }
}
