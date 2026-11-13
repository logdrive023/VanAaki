package repositorio

import (
	"context"
	"time"

	"github.com/lib/pq"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

// ---------------- recados tio ↔ escola ----------------

func (r *Repo) InserirRecado(ctx context.Context, m models.Recado) error {
	_, err := r.DB.ExecContext(ctx, `INSERT INTO recados (id, van_id, escola_id, de, texto, criado_em) VALUES ($1,$2,$3,$4,$5,$6::timestamptz)`,
		m.ID, m.VanID, m.EscolaID, m.De, m.Texto, m.CriadoEm)
	return err
}

func (r *Repo) listarRecados(ctx context.Context, where string, args ...any) ([]models.Recado, error) {
	rows, err := r.DB.QueryContext(ctx, `SELECT id, van_id, escola_id, de, texto, criado_em, lida FROM recados WHERE `+where+
		` AND criado_em > now() - interval '60 days' ORDER BY criado_em`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	l := []models.Recado{}
	for rows.Next() {
		var m models.Recado
		var em time.Time
		if err := rows.Scan(&m.ID, &m.VanID, &m.EscolaID, &m.De, &m.Texto, &em, &m.Lida); err != nil {
			return nil, err
		}
		m.CriadoEm = models.Iso(em)
		l = append(l, m)
	}
	return l, rows.Err()
}

// RecadosDasVans = conversas do tio com todas as escolas.
func (r *Repo) RecadosDasVans(ctx context.Context, vanIDs []string) ([]models.Recado, error) {
	return r.listarRecados(ctx, `van_id = ANY($1)`, pq.Array(vanIDs))
}

// RecadosDaEscola = conversas da escola com todas as vans.
func (r *Repo) RecadosDaEscola(ctx context.Context, escolaID string) ([]models.Recado, error) {
	return r.listarRecados(ctx, `escola_id = $1`, escolaID)
}

// LerRecados marca como lidos os recados que o OUTRO lado mandou nesta conversa.
func (r *Repo) LerRecados(ctx context.Context, vanID, escolaID, de string) error {
	_, err := r.DB.ExecContext(ctx, `UPDATE recados SET lida = TRUE WHERE van_id = $1 AND escola_id = $2 AND de = $3 AND NOT lida`, vanID, escolaID, de)
	return err
}
