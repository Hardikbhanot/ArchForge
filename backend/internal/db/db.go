package db

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	_ "github.com/lib/pq"
	_ "modernc.org/sqlite"
)

func InitDB() (*sql.DB, error) {
	// Try PostgreSQL first if env parameters are provided
	host := os.Getenv("DB_HOST")
	port := os.Getenv("DB_PORT")
	user := os.Getenv("DB_USER")
	pass := os.Getenv("DB_PASSWORD")
	name := os.Getenv("DB_NAME")
	ssl  := os.Getenv("DB_SSLMODE")

	if host == "" { host = "localhost" }
	if port == "" { port = "5432" }
	if user == "" { user = "postgres" }
	if pass == "" { pass = "postgres" }
	if name == "" { name = "archforge" }
	if ssl == ""  { ssl = "disable" }

	connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s connect_timeout=2", host, port, user, pass, name, ssl)
	db, err := sql.Open("postgres", connStr)
	if err == nil {
		// Set a short deadline connection verify
		db.SetConnMaxLifetime(time.Second)
		err = db.Ping()
		if err == nil {
			log.Println("PostgreSQL connection established successfully")
			if err := runMigrations(db, "postgres"); err != nil {
				db.Close()
				return nil, fmt.Errorf("failed to run postgres migrations: %w", err)
			}
			return db, nil
		}
		db.Close()
	}

	log.Printf("PostgreSQL connection failed (%v). Falling back to local SQLite...", err)

	// Fallback to local SQLite database file
	dbDir := "./data"
	if err := os.MkdirAll(dbDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data dir for SQLite: %w", err)
	}

	sqlitePath := filepath.Join(dbDir, "archforge.db")
	db, err = sql.Open("sqlite", sqlitePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open SQLite database: %w", err)
	}

	log.Printf("SQLite database opened successfully at %s", sqlitePath)

	if err := runMigrations(db, "sqlite"); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to run sqlite migrations: %w", err)
	}

	return db, nil
}

func runMigrations(db *sql.DB, driverName string) error {
	timestampType := "TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP"
	if driverName == "sqlite" {
		timestampType = "DATETIME DEFAULT CURRENT_TIMESTAMP"
	}

	usersTable := fmt.Sprintf(`
	CREATE TABLE IF NOT EXISTS users (
		id VARCHAR(255) PRIMARY KEY,
		username VARCHAR(255) UNIQUE NOT NULL,
		email VARCHAR(255) UNIQUE NOT NULL,
		password_hash VARCHAR(255) NOT NULL,
		github_access_token VARCHAR(255) NOT NULL DEFAULT '',
		created_at %s
	);`, timestampType)

	projectsTable := fmt.Sprintf(`
	CREATE TABLE IF NOT EXISTS projects (
		id VARCHAR(255) PRIMARY KEY,
		name VARCHAR(255) NOT NULL,
		git_url TEXT NOT NULL,
		local_path TEXT NOT NULL,
		branch VARCHAR(255) NOT NULL DEFAULT '',
		commit_hash VARCHAR(255) NOT NULL DEFAULT '',
		status VARCHAR(50) NOT NULL,
		owner_id VARCHAR(255) NOT NULL,
		error TEXT NOT NULL DEFAULT '',
		created_at %s,
		FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
	);`, timestampType)

	if _, err := db.Exec(usersTable); err != nil {
		return fmt.Errorf("failed creating users table: %w", err)
	}

	if _, err := db.Exec(projectsTable); err != nil {
		return fmt.Errorf("failed creating projects table: %w", err)
	}

	log.Printf("[%s] Database schemas verified/created successfully", driverName)
	return nil
}
