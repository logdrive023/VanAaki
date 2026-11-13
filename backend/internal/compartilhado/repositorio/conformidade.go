package repositorio

import (
	"context"
	"database/sql"
	"time"

	"github.com/lib/pq"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

// ---------------- PL 1240/2026: posições registradas ----------------

// InserirPosicoes grava várias posições de uma viagem de uma vez.
func (r *Repo) InserirPosicoes(ctx context.Context, viagemID, vanID, origem string, pts []models.PontoTrajeto) error {
	if len(pts) == 0 {
		return nil
	}
	lats, lngs, ems := make([]float64, len(pts)), make([]float64, len(pts)), make([]string, len(pts))
	for i, p := range pts {
		lats[i], lngs[i], ems[i] = p.Lat, p.Lng, p.Em
	}
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO posicoes (viagem_id, van_id, origem, lat, lng, em)
		SELECT $1, $2, $3, x.lat, x.lng, x.em::timestamptz
		FROM unnest($4::float8[], $5::float8[], $6::text[]) AS x(lat, lng, em)`,
		viagemID, vanID, origem, pq.Array(lats), pq.Array(lngs), pq.Array(ems))
	return err
}

// Trajeto = as posições de uma viagem, em ordem.
func (r *Repo) Trajeto(ctx context.Context, viagemID string) ([]models.PontoTrajeto, error) {
	rows, err := r.DB.QueryContext(ctx, `SELECT lat, lng, em FROM posicoes WHERE viagem_id = $1 ORDER BY em, id`, viagemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	l := []models.PontoTrajeto{}
	for rows.Next() {
		var p models.PontoTrajeto
		var em time.Time
		if err := rows.Scan(&p.Lat, &p.Lng, &em); err != nil {
			return nil, err
		}
		p.Em = models.Iso(em)
		l = append(l, p)
	}
	return l, rows.Err()
}

// EstatTrajeto = números do registro de uma viagem.
type EstatTrajeto struct {
	Pontos      int
	Km          float64
	Origem      string
	Primeira    string
	Ultima      string
}

// EstatTrajetos soma, por viagem, quantas posições foram gravadas e a distância percorrida (fórmula de haversine).
func (r *Repo) EstatTrajetos(ctx context.Context, vanID string, desde time.Time) (map[string]EstatTrajeto, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT viagem_id, count(*), coalesce(sum(d), 0) / 1000, max(origem), min(em), max(em) FROM (
			SELECT viagem_id, origem, em,
				6371000 * 2 * asin(sqrt(
					power(sin(radians(lat - lag(lat) OVER w) / 2), 2) +
					cos(radians(lat)) * cos(radians(lag(lat) OVER w)) * power(sin(radians(lng - lag(lng) OVER w) / 2), 2)
				)) AS d
			FROM posicoes WHERE van_id = $1 AND em >= $2
			WINDOW w AS (PARTITION BY viagem_id ORDER BY em, id)
		) x GROUP BY viagem_id`, vanID, desde)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	m := map[string]EstatTrajeto{}
	for rows.Next() {
		var id string
		var e EstatTrajeto
		var a, b time.Time
		if err := rows.Scan(&id, &e.Pontos, &e.Km, &e.Origem, &a, &b); err != nil {
			return nil, err
		}
		e.Primeira, e.Ultima = models.Iso(a), models.Iso(b)
		m[id] = e
	}
	return m, rows.Err()
}

// UltimaPosicao = quando a van mandou posição pela última vez (vazio se nunca).
func (r *Repo) UltimaPosicao(ctx context.Context, vanID string) (string, error) {
	var t sql.NullTime
	err := r.DB.QueryRowContext(ctx, `SELECT max(em) FROM posicoes WHERE van_id = $1`, vanID).Scan(&t)
	return isoNulo(t), err
}

// ViagensDesde = viagens da van a partir de uma data (mais recentes primeiro).
func (r *Repo) ViagensDesde(ctx context.Context, vanID, data string) ([]models.Viagem, error) {
	l, err := r.listarViagens(ctx, `van_id = $1 AND data >= $2 AND status <> 'cancelada'`, vanID, data)
	for i, j := 0, len(l)-1; i < j; i, j = i+1, j-1 {
		l[i], l[j] = l[j], l[i]
	}
	return l, err
}

// PurgarPosicoes apaga posições mais velhas que o limite (o PL pede pelo menos 90 dias; guardamos mais).
func (r *Repo) PurgarPosicoes(ctx context.Context, antes time.Time) (int64, error) {
	res, err := r.DB.ExecContext(ctx, `DELETE FROM posicoes WHERE em < $1`, antes)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// ---------------- acessos de fiscalização ----------------

const colAcesso = `token, van_id, nome, criado_em, expira_em, revogado_em, ultimo_acesso_em, acessos`

func scanAcesso(s scanner) (models.AcessoFiscal, error) {
	var a models.AcessoFiscal
	var criado, expira time.Time
	var revogado, ultimo sql.NullTime
	err := s.Scan(&a.Token, &a.VanID, &a.Nome, &criado, &expira, &revogado, &ultimo, &a.Acessos)
	a.CriadoEm, a.ExpiraEm, a.RevogadoEm, a.UltimoAcessoEm = models.Iso(criado), models.Iso(expira), isoNulo(revogado), isoNulo(ultimo)
	return a, err
}

func (r *Repo) CriarAcesso(ctx context.Context, a models.AcessoFiscal) error {
	_, err := r.DB.ExecContext(ctx, `INSERT INTO acessos_fiscais (token, van_id, nome, expira_em) VALUES ($1,$2,$3,$4::timestamptz)`,
		a.Token, a.VanID, a.Nome, a.ExpiraEm)
	return err
}

func (r *Repo) AcessosDaVan(ctx context.Context, vanID string) ([]models.AcessoFiscal, error) {
	rows, err := r.DB.QueryContext(ctx, `SELECT `+colAcesso+` FROM acessos_fiscais WHERE van_id = $1 ORDER BY criado_em DESC`, vanID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	l := []models.AcessoFiscal{}
	for rows.Next() {
		a, err := scanAcesso(rows)
		if err != nil {
			return nil, err
		}
		l = append(l, a)
	}
	return l, rows.Err()
}

func (r *Repo) RevogarAcesso(ctx context.Context, vanID, token string) (bool, error) {
	res, err := r.DB.ExecContext(ctx, `UPDATE acessos_fiscais SET revogado_em = now() WHERE van_id = $1 AND token = $2 AND revogado_em IS NULL`, vanID, token)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// UsarAcesso devolve o acesso válido (não expirado nem revogado) e conta a visita.
func (r *Repo) UsarAcesso(ctx context.Context, token string) (models.AcessoFiscal, error) {
	a, err := scanAcesso(r.DB.QueryRowContext(ctx, `
		UPDATE acessos_fiscais SET acessos = acessos + 1, ultimo_acesso_em = now()
		WHERE token = $1 AND revogado_em IS NULL AND expira_em > now()
		RETURNING `+colAcesso, token))
	return a, naoAchou(err)
}
