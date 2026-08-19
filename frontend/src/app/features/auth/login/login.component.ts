import { environment } from "../../../environments/environment";

import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  template: `
    <div class="auth-container">
      <div class="glow-mesh-1"></div>
      <div class="glow-mesh-2"></div>
      
      <div class="glass-card">
        <div class="brand-section">
          <div class="logo-icon">▲</div>
          <h2>ArchForge</h2>
          <p class="subtitle">AI-Native Software Architecture Platform</p>
        </div>

        <div class="oauth-section">
          <button type="button" class="btn-github" (click)="signInWithGithub()">
            Sign In with GitHub
          </button>
          <div class="divider">
            <span>or credentials</span>
          </div>
        </div>

        <form [formGroup]="loginForm" (ngSubmit)="onSubmit()" class="form-section">
          @if (errorMessage()) {
            <div class="error-banner animate-fade-in">
              <span class="error-icon">⚠</span>
              <p>{{ errorMessage() }}</p>
            </div>
          }

          <div class="input-group">
            <label for="email">Email or Username</label>
            <div class="input-wrapper">
              <input 
                id="email" 
                type="text" 
                formControlName="email" 
                placeholder="Enter your email or username"
                [class.invalid]="isFieldInvalid('email')"
              />
              <span class="input-glow"></span>
            </div>
            @if (isFieldInvalid('email')) {
              <span class="validation-error">Please enter a valid email or username</span>
            }
          </div>

          <div class="input-group">
            <div class="label-row">
              <label for="password">Password</label>
            </div>
            <div class="input-wrapper">
              <input 
                id="password" 
                [type]="showPassword() ? 'text' : 'password'" 
                formControlName="password" 
                placeholder="••••••••"
                [class.invalid]="isFieldInvalid('password')"
              />
              <button type="button" class="visibility-toggle" (click)="togglePassword()">
                {{ showPassword() ? '👁' : '👁‍🗨' }}
              </button>
              <span class="input-glow"></span>
            </div>
            @if (isFieldInvalid('password')) {
              <span class="validation-error">Password must be at least 6 characters</span>
            }
          </div>

          <button type="submit" [disabled]="loginForm.invalid || isLoading()" class="btn-submit">
            @if (isLoading()) {
              <span class="spinner"></span>
              Authenticating...
            } @else {
              Sign In
            }
          </button>
        </form>

        <div class="footer-links">
          <p>Don't have an account? <a routerLink="/register">Create account</a></p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
    }

    .auth-container {
      position: relative;
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
      height: 100%;
      /* Background is handled globally, but we keep this container transparent */
      font-family: var(--font-sans);
      color: var(--text-primary);
      overflow: hidden;
    }

    /* Modern Mesh Glow Background */
    .glow-mesh-1, .glow-mesh-2 {
      position: absolute;
      width: 600px;
      height: 600px;
      border-radius: 50%;
      filter: blur(120px);
      opacity: 0.15;
      z-index: 0;
      pointer-events: none;
    }

    .glow-mesh-1 {
      top: -10%;
      left: -10%;
      background: radial-gradient(circle, var(--accent-indigo) 0%, transparent 70%);
      animation: float-slow 20s infinite alternate;
    }

    .glow-mesh-2 {
      bottom: -10%;
      right: -10%;
      background: radial-gradient(circle, var(--accent-violet) 0%, transparent 70%);
      animation: float-slow-reverse 25s infinite alternate;
    }

    /* Glassmorphism Card Design */
    .glass-card {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 440px;
      padding: 3.5rem 2.5rem;
      border-radius: 24px;
      background: var(--bg-card);
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      border: 1px solid var(--border-subtle);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px var(--border-subtle) inset;
      animation: scale-up 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .brand-section {
      text-align: center;
      margin-bottom: 2.5rem;
    }

    .logo-icon {
      font-size: 2.2rem;
      color: var(--accent-indigo);
      text-shadow: 0 0 20px var(--accent-indigo-glow);
      margin-bottom: 0.5rem;
      animation: pulseGlow 2s infinite alternate;
    }

    .brand-section h2 {
      font-size: 1.8rem;
      font-weight: 800;
      letter-spacing: -0.025em;
      margin: 0;
      background: linear-gradient(135deg, #ffffff 0%, var(--text-secondary) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .subtitle {
      font-size: 0.875rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }

    .form-section {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .error-banner {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.875rem 1rem;
      border-radius: 12px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      color: #fca5a5;
      font-size: 0.875rem;
    }

    .error-icon {
      font-size: 1.1rem;
    }

    .error-banner p {
      margin: 0;
    }

    .input-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .label-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    label {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .input-wrapper {
      position: relative;
      width: 100%;
    }

    input {
      width: 100%;
      padding: 0.875rem 1.25rem;
      border-radius: 12px;
      background: rgba(2, 6, 23, 0.4);
      border: 1px solid var(--border-subtle);
      color: var(--text-primary);
      font-size: 0.9375rem;
      transition: all 0.2s ease;
      box-sizing: border-box;
      font-family: inherit;
    }

    input::placeholder {
      color: var(--text-muted);
    }

    input:focus {
      outline: none;
      border-color: var(--accent-indigo);
      background: rgba(2, 6, 23, 0.6);
      box-shadow: 0 0 15px var(--accent-indigo-glow);
    }

    input.invalid {
      border-color: rgba(239, 68, 68, 0.4);
    }

    input.invalid:focus {
      border-color: #ef4444;
      box-shadow: 0 0 15px rgba(239, 68, 68, 0.15);
    }

    .visibility-toggle {
      position: absolute;
      right: 1rem;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 1.1rem;
      padding: 0.25rem;
      transition: color 0.2s;
    }

    .visibility-toggle:hover {
      color: var(--text-primary);
    }

    .validation-error {
      font-size: 0.75rem;
      color: #f87171;
      margin-top: 0.25rem;
    }

    .btn-submit {
      position: relative;
      width: 100%;
      padding: 0.875rem;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--accent-indigo) 0%, var(--accent-violet) 100%);
      color: white;
      font-size: 0.9375rem;
      font-weight: 700;
      border: none;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 4px 12px var(--accent-indigo-glow);
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 0.5rem;
    }

    .btn-submit:hover:not(:disabled) {
      filter: brightness(1.1);
      transform: translateY(-1px);
      box-shadow: 0 8px 20px var(--accent-violet-glow);
    }

    .btn-submit:active:not(:disabled) {
      transform: translateY(1px);
    }

    .btn-submit:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      background: var(--bg-card-hover);
      box-shadow: none;
    }

    .spinner {
      width: 1rem;
      height: 1rem;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    .footer-links {
      text-align: center;
      margin-top: 2rem;
      font-size: 0.875rem;
      color: var(--text-secondary);
    }

    .footer-links a {
      color: var(--accent-indigo);
      text-decoration: none;
      font-weight: 600;
      transition: color 0.2s;
    }

    .footer-links a:hover {
      color: var(--accent-violet);
      text-decoration: underline;
    }

    .btn-github {
      width: 100%;
      padding: 0.875rem;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-primary);
      font-size: 0.9375rem;
      font-weight: 700;
      border: 1px solid var(--border-subtle);
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
    }

    .btn-github:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: var(--border-highlight);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .divider {
      display: flex;
      align-items: center;
      text-align: center;
      color: var(--text-muted);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 1.5rem;
    }

    .divider::before, .divider::after {
      content: '';
      flex: 1;
      border-bottom: 1px solid var(--border-subtle);
    }

    .divider::before {
      margin-right: .5em;
    }

    .divider::after {
      margin-left: .5em;
    }

    /* Keyframe Animations */
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @keyframes scale-up {
      from { opacity: 0; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1); }
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
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private http = inject(HttpClient);

  loginForm = this.fb.group({
    email: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  isLoading = signal(false);
  showPassword = signal(false);
  errorMessage = signal<string | null>(null);

  isFieldInvalid(fieldName: string): boolean {
    const field = this.loginForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  togglePassword(): void {
    this.showPassword.update(v => !v);
  }

  signInWithGithub(): void {
    this.http.get<{url: string}>(`${environment.apiUrl}/auth/github/login`).subscribe({
      next: (res) => {
        window.location.href = res.url;
      },
      error: (err) => {
        this.errorMessage.set('Failed to connect to GitHub auth service.');
      }
    });
  }

  onSubmit(): void {
    if (this.loginForm.invalid) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { email, password } = this.loginForm.value;

    this.authService.login(email!, password!).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.message || 'Incorrect credentials. Please try again.');
      }
    });
  }
}
