// Package database abre o Postgres e aplica as migrações (arquivos NNNN_nome.up.sql embutidos no binário).
package database

import (
	"database/sql"
	"embed"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	_ "github.com/lib/pq"
)

//go:embed migrations/*.sql
var arquivos embed.FS

// Abrir conecta e espera o banco subir (útil com docker compose).
func Abrir(url string) (*sql.DB, error) {
	db, err := sql.Open("postgres", url)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)
	for i := 0; ; i++ {
		if err = db.Ping(); err == nil {
			return db, nil
		}
		if i >= 30 {
			return nil, fmt.Errorf("banco não respondeu: %w", err)
		}
		log.Printf("esperando o banco... (%v)", err)
		time.Sleep(time.Second)
	}
}

// Migrar aplica, em ordem, as migrações .up.sql que ainda não rodaram.
func Migrar(db *sql.DB) error {
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (versao TEXT PRIMARY KEY, aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now())`); err != nil {
		return err
	}
	entradas, err := arquivos.ReadDir("migrations")
	if err != nil {
		return err
	}
	var ups []string
	for _, e := range entradas {
		if strings.HasSuffix(e.Name(), ".up.sql") {
			ups = append(ups, e.Name())
		}
	}
	sort.Strings(ups)
	for _, nome := range ups {
		versao := strings.TrimSuffix(nome, ".up.sql")
		var ja bool
		if err := db.QueryRow(`SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE versao = $1)`, versao).Scan(&ja); err != nil {
			return err
		}
		if ja {
			continue
		}
		sqlTxt, err := arquivos.ReadFile("migrations/" + nome)
		if err != nil {
			return err
		}
		tx, err := db.Begin()
		if err != nil {
			return err
		}
		if _, err := tx.Exec(string(sqlTxt)); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("migração %s: %w", nome, err)
		}
		if _, err := tx.Exec(`INSERT INTO schema_migrations (versao) VALUES ($1)`, versao); err != nil {
			_ = tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
		log.Printf("migração aplicada: %s", versao)
	}
	return nil
}
