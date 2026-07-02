import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  template: `
    <div class="auth-container">
      <div class="glow-mesh-1"></div>
      <div class="glow-mesh-2"></div>
      
      <div class="glass-card">
        <div class="brand-section">
          <div class="logo-icon">▲</div>
          <h2>Create Account</h2>
          <p class="subtitle">Join ArchForge to explore your codebase</p>
        </div>

        <form [formGroup]="registerForm" (ngSubmit)="onSubmit()" class="form-section">
          @if (errorMessage()) {
            <div class="error-banner animate-fade-in">
              <span class="error-icon">⚠</span>
              <p>{{ errorMessage() }}</p>
            </div>
          }

          <div class="input-group">
            <label for="username">Username</label>
            <div class="input-wrapper">
              <input 
                id="username" 
                type="text" 
                formControlName="username" 
                placeholder="Choose a username"
                [class.invalid]="isFieldInvalid('username')"
              />
              <span class="input-glow"></span>
            </div>
            @if (isFieldInvalid('username')) {
              <span class="validation-error">Username must be at least 3 characters</span>
            }
          </div>

          <div class="input-group">
            <label for="email">Email Address</label>
            <div class="input-wrapper">
              <input 
                id="email" 
                type="email" 
                formControlName="email" 
                placeholder="you@example.com"
                [class.invalid]="isFieldInvalid('email')"
              />
              <span class="input-glow"></span>
            </div>
            @if (isFieldInvalid('email')) {
              <span class="validation-error">Please enter a valid email address</span>
            }
          </div>

          <div class="input-group">
            <label for="password">Password</label>
            <div class="input-wrapper">
              <input 
                id="password" 
                [type]="showPassword() ? 'text' : 'password'" 
                formControlName="password" 
                placeholder="Min 6 characters"
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

          <button type="submit" [disabled]="registerForm.invalid || isLoading()" class="btn-submit">
            @if (isLoading()) {
              <span class="spinner"></span>
              Creating Account...
            } @else {
              Register
            }
          </button>
        </form>

        <div class="footer-links">
          <p>Already have an account? <a routerLink="/login">Sign in</a></p>
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
      background: radial-gradient(circle at center, #0f172a 0%, #020617 100%);
      font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #f1f5f9;
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
      background: radial-gradient(circle, #8b5cf6 0%, transparent 70%);
      animation: float-slow 20s infinite alternate;
    }

    .glow-mesh-2 {
      bottom: -10%;
      right: -10%;
      background: radial-gradient(circle, #3b82f6 0%, transparent 70%);
      animation: float-slow-reverse 25s infinite alternate;
    }

    /* Glassmorphism Card Design */
    .glass-card {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 440px;
      padding: 3rem 2.5rem;
      border-radius: 24px;
      background: rgba(15, 23, 42, 0.45);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      animation: scale-up 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .brand-section {
      text-align: center;
      margin-bottom: 2.2rem;
    }

    .logo-icon {
      font-size: 2.2rem;
      color: #8b5cf6;
      text-shadow: 0 0 20px rgba(139, 92, 246, 0.5);
      margin-bottom: 0.5rem;
      animation: pulse-glow 2s infinite alternate;
    }

    .brand-section h2 {
      font-size: 1.8rem;
      font-weight: 800;
      letter-spacing: -0.025em;
      margin: 0;
      background: linear-gradient(135deg, #ffffff 0%, #94a3b8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .subtitle {
      font-size: 0.875rem;
      color: #64748b;
      margin-top: 0.25rem;
    }

    .form-section {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
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

    label {
      font-size: 0.8125rem;
      font-weight: 600;
      color: #94a3b8;
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
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #f8fafc;
      font-size: 0.9375rem;
      transition: all 0.2s ease;
      box-sizing: border-box;
    }

    input::placeholder {
      color: #475569;
    }

    input:focus {
      outline: none;
      border-color: #8b5cf6;
      background: rgba(15, 23, 42, 0.8);
      box-shadow: 0 0 15px rgba(139, 92, 246, 0.15);
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
      color: #64748b;
      cursor: pointer;
      font-size: 1.1rem;
      padding: 0.25rem;
      transition: color 0.2s;
    }

    .visibility-toggle:hover {
      color: #94a3b8;
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
      background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
      color: white;
      font-size: 0.9375rem;
      font-weight: 700;
      border: none;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 0.5rem;
    }

    .btn-submit:hover:not(:disabled) {
      background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
      transform: translateY(-1px);
      box-shadow: 0 8px 20px rgba(124, 58, 237, 0.4);
    }

    .btn-submit:active:not(:disabled) {
      transform: translateY(1px);
    }

    .btn-submit:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      background: #334155;
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
      margin-top: 1.75rem;
      font-size: 0.875rem;
      color: #64748b;
    }

    .footer-links a {
      color: #8b5cf6;
      text-decoration: none;
      font-weight: 600;
      transition: color 0.2s;
    }

    .footer-links a:hover {
      color: #a78bfa;
      text-decoration: underline;
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

    @keyframes pulse-glow {
      from { text-shadow: 0 0 10px rgba(139, 92, 246, 0.3); }
      to { text-shadow: 0 0 25px rgba(139, 92, 246, 0.6); }
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
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  registerForm = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  isLoading = signal(false);
  showPassword = signal(false);
  errorMessage = signal<string | null>(null);

  isFieldInvalid(fieldName: string): boolean {
    const field = this.registerForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  togglePassword(): void {
    this.showPassword.update(v => !v);
  }

  onSubmit(): void {
    if (this.registerForm.invalid) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { username, email, password } = this.registerForm.value;

    this.authService.register(username!, email!, password!).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.message || 'Registration failed. Try a different username/email.');
      }
    });
  }
}
