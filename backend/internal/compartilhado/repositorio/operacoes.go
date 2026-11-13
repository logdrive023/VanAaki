package repositorio

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// BuscarOperacao devolve a resposta guardada de uma ação já feita (achou=false se é nova).
func (r *Repo) BuscarOperacao(ctx context.Context, usuarioID, chave string) (status int, corpo []byte, achou bool, err error) {
	err = r.DB.QueryRowContext(ctx, `SELECT status, corpo FROM operacoes WHERE usuario_id = $1 AND chave = $2`, usuarioID, chave).Scan(&status, &corpo)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil, false, nil
	}
	return status, corpo, err == nil, err
}

// GuardarOperacao grava a resposta de uma ação (a primeira vence se chegarem duas iguais ao mesmo tempo).
func (r *Repo) GuardarOperacao(ctx context.Context, usuarioID, chave string, status int, corpo []byte) error {
	_, err := r.DB.ExecContext(ctx, `INSERT INTO operacoes (usuario_id, chave, status, corpo) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
		usuarioID, chave, status, corpo)
	return err
}

// PurgarOperacoes apaga as chaves antigas (o app reenvia no máximo por alguns dias).
func (r *Repo) PurgarOperacoes(ctx context.Context, antes time.Time) (int64, error) {
	res, err := r.DB.ExecContext(ctx, `DELETE FROM operacoes WHERE criado_em < $1`, antes)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
