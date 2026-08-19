import { environment } from "../../../environments/environment";

import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, throwError, BehaviorSubject } from 'rxjs';

export interface User {
  id: string;
  username: string;
  email: string;
  created_at: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/auth`;

  // Signals for modern Angular reactivity
  private currentUserSignal = signal<User | null>(null);
  currentUser = computed(() => this.currentUserSignal());
  isAuthenticated = computed(() => !!this.currentUserSignal());

  constructor() {
    this.loadUserFromToken();
  }

  register(username: string, email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, { username, email, password }).pipe(
      tap(res => this.handleAuthentication(res.token, res.user)),
      catchError(err => this.handleError(err))
    );
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, { email, password }).pipe(
      tap(res => this.handleAuthentication(res.token, res.user)),
      catchError(err => this.handleError(err))
    );
  }

  logout(): void {
    localStorage.removeItem('af_token');
    localStorage.removeItem('af_user');
    this.currentUserSignal.set(null);
  }

  getToken(): string | null {
    return localStorage.getItem('af_token');
  }

  handleAuthentication(token: string, user: User): void {
    localStorage.setItem('af_token', token);
    localStorage.setItem('af_user', JSON.stringify(user));
    this.currentUserSignal.set(user);
  }

  private loadUserFromToken(): void {
    const token = this.getToken();
    const userStr = localStorage.getItem('af_user');

    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as User;
        // Verify token is not expired (simple payload decoding)
        const payload = JSON.parse(atob(token.split('.')[1]));
        const isExpired = payload.exp * 1000 < Date.now();
        if (isExpired) {
          this.logout();
        } else {
          this.currentUserSignal.set(user);
        }
      } catch (e) {
        this.logout();
      }
    }
  }

  private handleError(error: any): Observable<never> {
    let errorMessage = 'An unknown error occurred';
    if (error.error && error.error.error) {
      errorMessage = error.error.error;
    } else if (error.message) {
      errorMessage = error.message;
    }
    return throwError(() => new Error(errorMessage));
  }
}
