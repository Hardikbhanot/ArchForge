package auth

import (
	"errors"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrUserAlreadyExists = errors.New("user already exists")
	ErrUserNotFound      = errors.New("user not found")
)

type User struct {
	ID                string    `json:"id"`
	Username          string    `json:"username"`
	Email             string    `json:"email"`
	PasswordHash      string    `json:"-"`
	GithubAccessToken string    `json:"-"`
	CreatedAt         time.Time `json:"created_at"`
}

// HashPassword hashes a password using bcrypt.
func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

// CheckPasswordHash compares a password with its bcrypt hash.
func CheckPasswordHash(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

type UserStore interface {
	Create(user *User) error
	GetByEmail(email string) (*User, error)
	GetByUsername(username string) (*User, error)
	GetByID(id string) (*User, error)
	UpdateGithubToken(id string, token string) error
}

type InMemoryUserStore struct {
	mu        sync.RWMutex
	users     map[string]*User
	emails    map[string]string // email -> id
	usernames map[string]string // username -> id
}

func NewInMemoryUserStore() *InMemoryUserStore {
	return &InMemoryUserStore{
		users:     make(map[string]*User),
		emails:    make(map[string]string),
		usernames: make(map[string]string),
	}
}

func (s *InMemoryUserStore) Create(user *User) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.emails[user.Email]; exists {
		return ErrUserAlreadyExists
	}
	if _, exists := s.usernames[user.Username]; exists {
		return ErrUserAlreadyExists
	}

	s.users[user.ID] = user
	s.emails[user.Email] = user.ID
	s.usernames[user.Username] = user.ID

	return nil
}

func (s *InMemoryUserStore) GetByEmail(email string) (*User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	id, exists := s.emails[email]
	if !exists {
		return nil, ErrUserNotFound
	}
	return s.users[id], nil
}

func (s *InMemoryUserStore) GetByUsername(username string) (*User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	id, exists := s.usernames[username]
	if !exists {
		return nil, ErrUserNotFound
	}
	return s.users[id], nil
}

func (s *InMemoryUserStore) GetByID(id string) (*User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	user, exists := s.users[id]
	if !exists {
		return nil, ErrUserNotFound
	}
	return user, nil
}

func (s *InMemoryUserStore) UpdateGithubToken(id string, token string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	user, exists := s.users[id]
	if !exists {
		return ErrUserNotFound
	}
	user.GithubAccessToken = token
	return nil
}
