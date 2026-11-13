package repositorio

import (
	"context"
	"time"

	"github.com/lib/pq"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

// ---------------- documentos ----------------

// SalvarDocumento grava (ou troca) o documento daquele tipo; validade nova = avisos começam de novo.
func (r *Repo) SalvarDocumento(ctx context.Context, d models.Documento) error {
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO documentos (id, van_id, tipo, numero, validade, avisado, atualizado_em) VALUES ($1,$2,$3,$4,$5,'',now())
		ON CONFLICT (van_id, tipo) DO UPDATE SET numero = $4, validade = $5, atualizado_em = now(),
		  avisado = CASE WHEN documentos.validade = $5 THEN documentos.avisado ELSE '' END`,
		d.ID, d.VanID, d.Tipo, d.Numero, d.Validade)
	return err
}

func (r *Repo) ExcluirDocumento(ctx context.Context, vanID, tipo string) error {
	_, err := r.DB.ExecContext(ctx, `DELETE FROM documentos WHERE van_id = $1 AND tipo = $2`, vanID, tipo)
	return err
}

func (r *Repo) DocumentosDasVans(ctx context.Context, vanIDs []string) ([]models.Documento, error) {
	rows, err := r.DB.QueryContext(ctx, `SELECT id, van_id, tipo, numero, validade, atualizado_em FROM documentos WHERE van_id = ANY($1) ORDER BY tipo`, pq.Array(vanIDs))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	l := []models.Documento{}
	for rows.Next() {
		var d models.Documento
		var em time.Time
		if err := rows.Scan(&d.ID, &d.VanID, &d.Tipo, &d.Numero, &d.Validade, &em); err != nil {
			return nil, err
		}
		d.AtualizadoEm = models.Iso(em)
		l = append(l, d)
	}
	return l, rows.Err()
}

// DocAviso = documento + o último marco já avisado.
type DocAviso struct {
	models.Documento
	Avisado string
}

// DocumentosAteh: os que vencem até a data (inclusive) — o serviço decide qual marco avisar.
func (r *Repo) DocumentosAte(ctx context.Context, data string) ([]DocAviso, error) {
	rows, err := r.DB.QueryContext(ctx, `SELECT id, van_id, tipo, numero, validade, avisado FROM documentos WHERE validade <= $1`, data)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	l := []DocAviso{}
	for rows.Next() {
		var d DocAviso
		if err := rows.Scan(&d.ID, &d.VanID, &d.Tipo, &d.Numero, &d.Validade, &d.Avisado); err != nil {
			return nil, err
		}
		l = append(l, d)
	}
	return l, rows.Err()
}

func (r *Repo) MarcarDocumentoAvisado(ctx context.Context, id, marco string) error {
	_, err := r.DB.ExecContext(ctx, `UPDATE documentos SET avisado = $2 WHERE id = $1`, id, marco)
	return err
}

// ---------------- LGPD ----------------

func (r *Repo) Consentir(ctx context.Context, usuarioID, versao string) error {
	_, err := r.DB.ExecContext(ctx, `INSERT INTO consentimentos (usuario_id, versao) VALUES ($1,$2) ON CONFLICT DO NOTHING`, usuarioID, versao)
	return err
}

// Consentimentos do usuário, do mais novo para o mais velho.
func (r *Repo) Consentimentos(ctx context.Context, usuarioID string) ([]models.Consentimento, error) {
	rows, err := r.DB.QueryContext(ctx, `SELECT versao, aceito_em FROM consentimentos WHERE usuario_id = $1 ORDER BY aceito_em DESC`, usuarioID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	l := []models.Consentimento{}
	for rows.Next() {
		var c models.Consentimento
		var em time.Time
		if err := rows.Scan(&c.Versao, &em); err != nil {
			return nil, err
		}
		c.AceitoEm = models.Iso(em)
		l = append(l, c)
	}
	return l, rows.Err()
}

// ExcluirUsuario apaga a conta (vínculos com os filhos e consentimentos vão junto, em cascata).
func (r *Repo) ExcluirUsuario(ctx context.Context, id string) error {
	_, err := r.DB.ExecContext(ctx, `DELETE FROM usuarios WHERE id = $1`, id)
	return err
}
