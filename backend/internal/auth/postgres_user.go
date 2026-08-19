package auth

import (
	"database/sql"
	"errors"
	"strings"

	"github.com/lib/pq"
)

type PostgresUserStore struct {
	db *sql.DB
}

func NewPostgresUserStore(db *sql.DB) *PostgresUserStore {
	return &PostgresUserStore{db: db}
}

func (s *PostgresUserStore) Create(user *User) error {
	query := `
	INSERT INTO users (id, username, email, password_hash, github_access_token, created_at)
	VALUES ($1, $2, $3, $4, $5, $6);`

	_, err := s.db.Exec(query, user.ID, user.Username, user.Email, user.PasswordHash, user.GithubAccessToken, user.CreatedAt)
	if err != nil {
		if pqErr, ok := err.(*pq.Error); ok && pqErr.Code == "23505" {
			return ErrUserAlreadyExists
		}
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return ErrUserAlreadyExists
		}
		return err
	}
	return nil
}

func (s *PostgresUserStore) GetByEmail(email string) (*User, error) {
	query := `
	SELECT id, username, email, password_hash, github_access_token, created_at
	FROM users
	WHERE email = $1;`

	row := s.db.QueryRow(query, email)
	var u User
	err := row.Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.GithubAccessToken, &u.CreatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &u, nil
}

func (s *PostgresUserStore) GetByUsername(username string) (*User, error) {
	query := `
	SELECT id, username, email, password_hash, github_access_token, created_at
	FROM users
	WHERE username = $1;`

	row := s.db.QueryRow(query, username)
	var u User
	err := row.Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.GithubAccessToken, &u.CreatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &u, nil
}

func (s *PostgresUserStore) GetByID(id string) (*User, error) {
	query := `
	SELECT id, username, email, password_hash, github_access_token, created_at
	FROM users
	WHERE id = $1;`

	row := s.db.QueryRow(query, id)
	var u User
	err := row.Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.GithubAccessToken, &u.CreatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &u, nil
}

func (s *PostgresUserStore) UpdateGithubToken(id string, token string) error {
	query := `
	UPDATE users
	SET github_access_token = $1
	WHERE id = $2;`

	res, err := s.db.Exec(query, token, id)
	if err != nil {
		return err
	}

	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrUserNotFound
	}
	return nil
}
