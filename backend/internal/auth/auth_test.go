package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPasswordHashing(t *testing.T) {
	password := "my-secret-password"
	hash, err := HashPassword(password)
	if err != nil {
		t.Fatalf("failed to hash password: %v", err)
	}

	if hash == password {
		t.Errorf("hash should not match original password string")
	}

	if !CheckPasswordHash(password, hash) {
		t.Errorf("expected password to match hash")
	}

	if CheckPasswordHash("wrong-password", hash) {
		t.Errorf("password match should fail for incorrect password")
	}
}

func TestJWTToken(t *testing.T) {
	userID := "user-123"
	username := "testuser"

	token, err := GenerateToken(userID, username)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	claims, err := ValidateToken(token)
	if err != nil {
		t.Fatalf("failed to validate token: %v", err)
	}

	if claims.UserID != userID {
		t.Errorf("expected UserID to be %s, got %s", userID, claims.UserID)
	}

	if claims.Username != username {
		t.Errorf("expected Username to be %s, got %s", username, claims.Username)
	}
}

func TestInMemoryStore(t *testing.T) {
	store := NewInMemoryUserStore()
	user := &User{
		ID:           "id-1",
		Username:     "alice",
		Email:        "alice@example.com",
		PasswordHash: "some-hash",
	}

	if err := store.Create(user); err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	// Test duplicate email
	dupEmailUser := &User{
		ID:           "id-2",
		Username:     "bob",
		Email:        "alice@example.com",
		PasswordHash: "some-hash",
	}
	if err := store.Create(dupEmailUser); err != ErrUserAlreadyExists {
		t.Errorf("expected ErrUserAlreadyExists, got %v", err)
	}

	// Test duplicate username
	dupUsernameUser := &User{
		ID:           "id-3",
		Username:     "alice",
		Email:        "bob@example.com",
		PasswordHash: "some-hash",
	}
	if err := store.Create(dupUsernameUser); err != ErrUserAlreadyExists {
		t.Errorf("expected ErrUserAlreadyExists, got %v", err)
	}

	// Test retrieval
	byEmail, err := store.GetByEmail("alice@example.com")
	if err != nil {
		t.Fatalf("failed to retrieve by email: %v", err)
	}
	if byEmail.ID != "id-1" {
		t.Errorf("expected id-1, got %s", byEmail.ID)
	}

	byUsername, err := store.GetByUsername("alice")
	if err != nil {
		t.Fatalf("failed to retrieve by username: %v", err)
	}
	if byUsername.ID != "id-1" {
		t.Errorf("expected id-1, got %s", byUsername.ID)
	}

	byID, err := store.GetByID("id-1")
	if err != nil {
		t.Fatalf("failed to retrieve by ID: %v", err)
	}
	if byID.Username != "alice" {
		t.Errorf("expected username alice, got %s", byID.Username)
	}
}

func TestAuthEndpoints(t *testing.T) {
	store := NewInMemoryUserStore()
	handler := NewAuthHandler(store)

	// 1. Test Register
	regBody := registerRequest{
		Username: "bob",
		Email:    "bob@example.com",
		Password: "password123",
	}
	bodyBytes, _ := json.Marshal(regBody)
	req := httptest.NewRequest(http.MethodPost, "/register", bytes.NewBuffer(bodyBytes))
	rec := httptest.NewRecorder()

	handler.Register(rec, req)

	if rec.Code != http.StatusCreated {
		t.Errorf("expected status 201 Created, got %d. Body: %s", rec.Code, rec.Body.String())
	}

	var res authResponse
	if err := json.NewDecoder(rec.Body).Decode(&res); err != nil {
		t.Fatalf("failed to decode authResponse: %v", err)
	}

	if res.Token == "" {
		t.Errorf("expected a non-empty token")
	}

	if res.User.Username != "bob" {
		t.Errorf("expected user username bob, got %s", res.User.Username)
	}

	// 2. Test Login
	loginBody := loginRequest{
		Email:    "bob@example.com",
		Password: "password123",
	}
	loginBytes, _ := json.Marshal(loginBody)
	loginReq := httptest.NewRequest(http.MethodPost, "/login", bytes.NewBuffer(loginBytes))
	loginRec := httptest.NewRecorder()

	handler.Login(loginRec, loginReq)

	if loginRec.Code != http.StatusOK {
		t.Errorf("expected status 200 OK, got %d. Body: %s", loginRec.Code, loginRec.Body.String())
	}

	var loginRes authResponse
	_ = json.NewDecoder(loginRec.Body).Decode(&loginRes)
	if loginRes.Token == "" {
		t.Errorf("expected token in login response")
	}

	// 3. Test AuthMiddleware and /me
	meReq := httptest.NewRequest(http.MethodGet, "/me", nil)
	meRec := httptest.NewRecorder()

	// Inject claims into context manually to simulate middleware success
	ctx := context.WithValue(meReq.Context(), UserIDKey, res.User.ID)
	ctx = context.WithValue(ctx, UsernameKey, res.User.Username)
	meReq = meReq.WithContext(ctx)

	handler.Me(meRec, meReq)

	if meRec.Code != http.StatusOK {
		t.Errorf("expected status 200 OK, got %d. Body: %s", meRec.Code, meRec.Body.String())
	}

	var meUser User
	_ = json.NewDecoder(meRec.Body).Decode(&meUser)
	if meUser.ID != res.User.ID {
		t.Errorf("expected ID %s, got %s", res.User.ID, meUser.ID)
	}
}
