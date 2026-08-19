package project

import (
	"database/sql"
	"errors"
)

type PostgresProjectStore struct {
	db *sql.DB
}

func NewPostgresProjectStore(db *sql.DB) *PostgresProjectStore {
	return &PostgresProjectStore{db: db}
}

func (s *PostgresProjectStore) Create(p *Project) error {
	query := `
	INSERT INTO projects (id, name, git_url, local_path, branch, commit_hash, status, owner_id, error, created_at)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`

	_, err := s.db.Exec(query, p.ID, p.Name, p.GitURL, p.LocalPath, p.Branch, p.CommitHash, p.Status, p.OwnerID, p.Error, p.CreatedAt)
	return err
}

func (s *PostgresProjectStore) GetByID(id string) (*Project, error) {
	query := `
	SELECT id, name, git_url, local_path, branch, commit_hash, status, owner_id, error, created_at
	FROM projects
	WHERE id = $1;`

	row := s.db.QueryRow(query, id)
	var p Project
	err := row.Scan(&p.ID, &p.Name, &p.GitURL, &p.LocalPath, &p.Branch, &p.CommitHash, &p.Status, &p.OwnerID, &p.Error, &p.CreatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrProjectNotFound
		}
		return nil, err
	}
	return &p, nil
}

func (s *PostgresProjectStore) ListByOwner(ownerID string) ([]*Project, error) {
	query := `
	SELECT id, name, git_url, local_path, branch, commit_hash, status, owner_id, error, created_at
	FROM projects
	WHERE owner_id = $1
	ORDER BY created_at DESC;`

	rows, err := s.db.Query(query, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*Project
	for rows.Next() {
		var p Project
		err := rows.Scan(&p.ID, &p.Name, &p.GitURL, &p.LocalPath, &p.Branch, &p.CommitHash, &p.Status, &p.OwnerID, &p.Error, &p.CreatedAt)
		if err != nil {
			return nil, err
		}
		list = append(list, &p)
	}
	return list, nil
}

func (s *PostgresProjectStore) UpdateStatus(id string, status ProjectStatus, localPath string, commitHash string, errStr string) error {
	query := `
	UPDATE projects
	SET status = $1, local_path = $2, commit_hash = $3, error = $4
	WHERE id = $5;`

	res, err := s.db.Exec(query, status, localPath, commitHash, errStr, id)
	if err != nil {
		return err
	}

	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrProjectNotFound
	}
	return nil
}

func (s *PostgresProjectStore) Delete(id string) error {
	query := `
	DELETE FROM projects
	WHERE id = $1;`

	res, err := s.db.Exec(query, id)
	if err != nil {
		return err
	}

	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrProjectNotFound
	}
	return nil
}
