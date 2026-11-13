// Package repositorio é o acesso ao Postgres usado pelos domínios (escolas, vans, alunos, viagens…).
// Cada domínio tem a sua regra no service; aqui só ficam as consultas.
package repositorio

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/lib/pq"
	"github.com/logdrive023/vanaaki/backend/internal/core"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

type Repo struct{ DB *sql.DB }

func New(db *sql.DB) *Repo { return &Repo{DB: db} }

// ---------------- ajudantes ----------------

func nulo(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func isoNulo(t sql.NullTime) string {
	if !t.Valid {
		return ""
	}
	return models.Iso(t.Time)
}

func js(v any) []byte { b, _ := json.Marshal(v); return b }

func naoAchou(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return core.ErrNaoEncontrado
	}
	return err
}

type scanner interface{ Scan(dest ...any) error }

// ---------------- escolas ----------------

const colEscola = `id, nome, endereco, lat, lng, horarios, confirma_entrada, codigo`

func scanEscola(s scanner) (models.Escola, error) {
	var e models.Escola
	var h []byte
	err := s.Scan(&e.ID, &e.Nome, &e.Endereco, &e.Local.Lat, &e.Local.Lng, &h, &e.ConfirmaEntrada, &e.Codigo)
	if err == nil {
		_ = json.Unmarshal(h, &e.Horarios)
		if e.Horarios == nil {
			e.Horarios = map[models.Turno]models.Horario{}
		}
	}
	return e, err
}

func (r *Repo) listarEscolas(ctx context.Context, q string, args ...any) ([]models.Escola, error) {
	rows, err := r.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	l := []models.Escola{}
	for rows.Next() {
		e, err := scanEscola(rows)
		if err != nil {
			return nil, err
		}
		l = append(l, e)
	}
	return l, rows.Err()
}

func (r *Repo) Escolas(ctx context.Context) ([]models.Escola, error) {
	return r.listarEscolas(ctx, `SELECT `+colEscola+` FROM escolas ORDER BY nome`)
}

func (r *Repo) EscolasPorIDs(ctx context.Context, ids []string) ([]models.Escola, error) {
	return r.listarEscolas(ctx, `SELECT `+colEscola+` FROM escolas WHERE id = ANY($1) ORDER BY nome`, pq.Array(ids))
}

func (r *Repo) MapaEscolas(ctx context.Context, ids []string) (map[string]models.Escola, error) {
	l, err := r.EscolasPorIDs(ctx, ids)
	m := map[string]models.Escola{}
	for _, e := range l {
		m[e.ID] = e
	}
	return m, err
}

func (r *Repo) Escola(ctx context.Context, id string) (models.Escola, error) {
	e, err := scanEscola(r.DB.QueryRowContext(ctx, `SELECT `+colEscola+` FROM escolas WHERE id = $1`, id))
	return e, naoAchou(err)
}

func (r *Repo) EscolaPorCodigo(ctx context.Context, codigo string) (models.Escola, error) {
	e, err := scanEscola(r.DB.QueryRowContext(ctx, `SELECT `+colEscola+` FROM escolas WHERE upper(codigo) = upper($1)`, codigo))
	return e, naoAchou(err)
}

func (r *Repo) SalvarEscola(ctx context.Context, e models.Escola) error {
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO escolas (id, nome, endereco, lat, lng, horarios, confirma_entrada, codigo)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		ON CONFLICT (id) DO UPDATE SET nome=$2, endereco=$3, lat=$4, lng=$5, horarios=$6, confirma_entrada=$7`,
		e.ID, e.Nome, e.Endereco, e.Local.Lat, e.Local.Lng, js(e.Horarios), e.ConfirmaEntrada, e.Codigo)
	return err
}

// ---------------- vans ----------------

const colVan = `id, nome, motorista, telefone, placa, modelo, garagem_lat, garagem_lng, escola_ids, turnos, credenciamento, preco_padrao, vagas, avaliacao, rotas_fixas, config`

func scanVan(s scanner) (models.Van, error) {
	var v models.Van
	var esc, tur, cred, rf, cfg []byte
	err := s.Scan(&v.ID, &v.Nome, &v.Motorista, &v.Telefone, &v.Placa, &v.Modelo, &v.Garagem.Lat, &v.Garagem.Lng,
		&esc, &tur, &cred, &v.PrecoPadrao, &v.Vagas, &v.Avaliacao, &rf, &cfg)
	if err == nil {
		_ = json.Unmarshal(cfg, &v.Config)
		v.Config = v.Config.Normalizar()
		_ = json.Unmarshal(esc, &v.EscolaIDs)
		_ = json.Unmarshal(tur, &v.Turnos)
		_ = json.Unmarshal(cred, &v.Credenciamento)
		_ = json.Unmarshal(rf, &v.RotasFixas)
		if v.EscolaIDs == nil {
			v.EscolaIDs = []string{}
		}
		if v.Credenciamento == nil {
			v.Credenciamento = map[string]string{}
		}
		if v.Turnos == nil {
			v.Turnos = []models.TurnoVan{}
		}
	}
	return v, err
}

func (r *Repo) Van(ctx context.Context, id string) (models.Van, error) {
	v, err := scanVan(r.DB.QueryRowContext(ctx, `SELECT `+colVan+` FROM vans WHERE id = $1`, id))
	return v, naoAchou(err)
}

func (r *Repo) listarVans(ctx context.Context, q string, args ...any) ([]models.Van, error) {
	rows, err := r.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	l := []models.Van{}
	for rows.Next() {
		v, err := scanVan(rows)
		if err != nil {
			return nil, err
		}
		l = append(l, v)
	}
	return l, rows.Err()
}

func (r *Repo) VansPorIDs(ctx context.Context, ids []string) ([]models.Van, error) {
	return r.listarVans(ctx, `SELECT `+colVan+` FROM vans WHERE id = ANY($1)`, pq.Array(ids))
}

// VansDaEscola = vans que atendem a escola (em qualquer turno ou pedindo credenciamento).
func (r *Repo) VansDaEscola(ctx context.Context, escolaID string) ([]models.Van, error) {
	return r.listarVans(ctx, `SELECT `+colVan+` FROM vans WHERE escola_ids ? $1 ORDER BY nome`, escolaID)
}

func (r *Repo) SalvarVan(ctx context.Context, v models.Van, demo bool) error {
	if v.RotasFixas == nil {
		v.RotasFixas = map[string]models.RotaFixa{}
	}
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO vans (`+colVan+`, demo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
		ON CONFLICT (id) DO UPDATE SET nome=$2, motorista=$3, telefone=$4, placa=$5, modelo=$6, garagem_lat=$7, garagem_lng=$8,
		  escola_ids=$9, turnos=$10, credenciamento=$11, preco_padrao=$12, vagas=$13, avaliacao=$14, rotas_fixas=$15, config=$16`,
		v.ID, v.Nome, v.Motorista, v.Telefone, v.Placa, v.Modelo, v.Garagem.Lat, v.Garagem.Lng,
		js(v.EscolaIDs), js(v.Turnos), js(v.Credenciamento), v.PrecoPadrao, v.Vagas, v.Avaliacao, js(v.RotasFixas), js(v.Config), demo)
	return err
}

// ---------------- alunos ----------------

const colAluno = `a.id, a.van_id, a.escola_id, a.nome, a.apelido, a.cor, a.serie, a.turno, a.responsavel, a.telefone_resp, a.endereco,
	a.lat, a.lng, a.mensalidade, a.dia_vencimento, a.ativo, a.criado_em, a.codigo_familia, a.codigo_aluno,
	a.cuidados, a.contato_extra, a.telefone_extra,
	EXISTS (SELECT 1 FROM familia_alunos f WHERE f.aluno_id = a.id)`

func scanAluno(s scanner) (models.Aluno, error) {
	var a models.Aluno
	var criado time.Time
	err := s.Scan(&a.ID, &a.VanID, &a.EscolaID, &a.Nome, &a.Apelido, &a.Cor, &a.Serie, &a.Turno, &a.Responsavel, &a.TelefoneResp,
		&a.Endereco, &a.Local.Lat, &a.Local.Lng, &a.Mensalidade, &a.DiaVencimento, &a.Ativo, &criado, &a.CodigoFamilia, &a.CodigoAluno,
		&a.Cuidados, &a.ContatoExtra, &a.TelefoneExtra, &a.FamiliaConectada)
	a.CriadoEm = models.Iso(criado)
	a.Completo = true
	return a, err
}

func (r *Repo) listarAlunos(ctx context.Context, where string, args ...any) ([]models.Aluno, error) {
	rows, err := r.DB.QueryContext(ctx, `SELECT `+colAluno+` FROM alunos a WHERE `+where+` ORDER BY a.nome`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	l := []models.Aluno{}
	for rows.Next() {
		a, err := scanAluno(rows)
		if err != nil {
			return nil, err
		}
		l = append(l, a)
	}
	return l, rows.Err()
}

func (r *Repo) Aluno(ctx context.Context, id string) (models.Aluno, error) {
	a, err := scanAluno(r.DB.QueryRowContext(ctx, `SELECT `+colAluno+` FROM alunos a WHERE a.id = $1`, id))
	return a, naoAchou(err)
}

func (r *Repo) AlunosDasVans(ctx context.Context, vanIDs []string) ([]models.Aluno, error) {
	return r.listarAlunos(ctx, `a.van_id = ANY($1)`, pq.Array(vanIDs))
}

func (r *Repo) AlunosDaEscola(ctx context.Context, escolaID string) ([]models.Aluno, error) {
	return r.listarAlunos(ctx, `a.escola_id = $1`, escolaID)
}

func (r *Repo) AlunosPorIDs(ctx context.Context, ids []string) ([]models.Aluno, error) {
	return r.listarAlunos(ctx, `a.id = ANY($1)`, pq.Array(ids))
}

func (r *Repo) MapaAlunos(ctx context.Context, ids []string) (map[string]models.Aluno, error) {
	l, err := r.AlunosPorIDs(ctx, ids)
	m := map[string]models.Aluno{}
	for _, a := range l {
		m[a.ID] = a
	}
	return m, err
}

func (r *Repo) AlunoPorCodigo(ctx context.Context, coluna, codigo string) (models.Aluno, error) {
	if coluna != "codigo_familia" && coluna != "codigo_aluno" {
		return models.Aluno{}, core.ErrNaoEncontrado
	}
	a, err := scanAluno(r.DB.QueryRowContext(ctx, `SELECT `+colAluno+` FROM alunos a WHERE upper(a.`+coluna+`) = upper($1)`, codigo))
	return a, naoAchou(err)
}

func (r *Repo) SalvarAluno(ctx context.Context, a models.Aluno) error {
	criado := a.CriadoEm
	if criado == "" {
		criado = models.AgoraIso()
	}
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO alunos (id, van_id, escola_id, nome, apelido, cor, serie, turno, responsavel, telefone_resp, endereco, lat, lng,
		  mensalidade, dia_vencimento, ativo, codigo_familia, codigo_aluno, criado_em, cuidados, contato_extra, telefone_extra)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
		ON CONFLICT (id) DO UPDATE SET escola_id=$3, nome=$4, apelido=$5, cor=$6, serie=$7, turno=$8, responsavel=$9, telefone_resp=$10,
		  endereco=$11, lat=$12, lng=$13, mensalidade=$14, dia_vencimento=$15, ativo=$16,
		  cuidados=$20, contato_extra=$21, telefone_extra=$22`,
		a.ID, a.VanID, a.EscolaID, a.Nome, a.Apelido, a.Cor, a.Serie, a.Turno, a.Responsavel, a.TelefoneResp, a.Endereco,
		a.Local.Lat, a.Local.Lng, a.Mensalidade, a.DiaVencimento, a.Ativo, a.CodigoFamilia, a.CodigoAluno, criado, a.Cuidados, a.ContatoExtra, a.TelefoneExtra)
	return err
}

// ---------------- usuários ----------------

const colUsuario = `id, perfil, nome, COALESCE(email,''), telefone, senha_hash, COALESCE(van_id,''), COALESCE(escola_id,''), COALESCE(aluno_id,''), demo`

func scanUsuario(s scanner) (models.Usuario, error) {
	var u models.Usuario
	err := s.Scan(&u.ID, &u.Perfil, &u.Nome, &u.Email, &u.Telefone, &u.SenhaHash, &u.VanID, &u.EscolaID, &u.AlunoID, &u.Demo)
	return u, err
}

func (r *Repo) Usuario(ctx context.Context, id string) (models.Usuario, error) {
	u, err := scanUsuario(r.DB.QueryRowContext(ctx, `SELECT `+colUsuario+` FROM usuarios WHERE id = $1`, id))
	return u, naoAchou(err)
}

func (r *Repo) UsuarioPorEmail(ctx context.Context, email string) (models.Usuario, error) {
	u, err := scanUsuario(r.DB.QueryRowContext(ctx, `SELECT `+colUsuario+` FROM usuarios WHERE lower(email) = lower($1)`, email))
	return u, naoAchou(err)
}

func (r *Repo) UsuarioDoAluno(ctx context.Context, alunoID string) (models.Usuario, error) {
	u, err := scanUsuario(r.DB.QueryRowContext(ctx, `SELECT `+colUsuario+` FROM usuarios WHERE perfil = 'aluno' AND aluno_id = $1`, alunoID))
	return u, naoAchou(err)
}

func (r *Repo) UsuarioDemo(ctx context.Context, perfil string) (models.Usuario, error) {
	u, err := scanUsuario(r.DB.QueryRowContext(ctx, `SELECT `+colUsuario+` FROM usuarios WHERE demo AND perfil = $1 ORDER BY criado_em LIMIT 1`, perfil))
	return u, naoAchou(err)
}

func (r *Repo) CriarUsuario(ctx context.Context, u models.Usuario) error {
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO usuarios (id, perfil, nome, email, telefone, senha_hash, van_id, escola_id, aluno_id, demo)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		u.ID, u.Perfil, u.Nome, nulo(u.Email), u.Telefone, u.SenhaHash, nulo(u.VanID), nulo(u.EscolaID), nulo(u.AlunoID), u.Demo)
	var pe *pq.Error
	if errors.As(err, &pe) && pe.Code == "23505" {
		return core.Invalido("Esse e-mail já tem conta. Use \"Entrar\".")
	}
	return err
}

func (r *Repo) VincularFamilia(ctx context.Context, usuarioID, alunoID string) error {
	_, err := r.DB.ExecContext(ctx, `INSERT INTO familia_alunos (usuario_id, aluno_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, usuarioID, alunoID)
	return err
}

func (r *Repo) AlunosDaFamilia(ctx context.Context, usuarioID string) ([]models.Aluno, error) {
	return r.listarAlunos(ctx, `a.id IN (SELECT aluno_id FROM familia_alunos WHERE usuario_id = $1)`, usuarioID)
}

// FamiliasDosAlunos = usuários (pais) ligados a cada aluno.
func (r *Repo) FamiliasDosAlunos(ctx context.Context, alunoIDs []string) (map[string][]string, error) {
	rows, err := r.DB.QueryContext(ctx, `SELECT aluno_id, usuario_id FROM familia_alunos WHERE aluno_id = ANY($1)`, pq.Array(alunoIDs))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	m := map[string][]string{}
	for rows.Next() {
		var a, u string
		if err := rows.Scan(&a, &u); err != nil {
			return nil, err
		}
		m[a] = append(m[a], u)
	}
	return m, rows.Err()
}

// ---------------- pagamentos ----------------

const colPag = `id, aluno_id, mes, valor, vencimento, status, pago_em, COALESCE(metodo,''), informado_em`

func scanPag(s scanner) (models.Pagamento, error) {
	var p models.Pagamento
	var pago, informado sql.NullTime
	err := s.Scan(&p.ID, &p.AlunoID, &p.Mes, &p.Valor, &p.Vencimento, &p.Status, &pago, &p.Metodo, &informado)
	p.PagoEm, p.InformadoEm = isoNulo(pago), isoNulo(informado)
	return p, err
}

func (r *Repo) PagamentosDosAlunos(ctx context.Context, ids []string) ([]models.Pagamento, error) {
	rows, err := r.DB.QueryContext(ctx, `SELECT `+colPag+` FROM pagamentos WHERE aluno_id = ANY($1) ORDER BY mes DESC`, pq.Array(ids))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	l := []models.Pagamento{}
	for rows.Next() {
		p, err := scanPag(rows)
		if err != nil {
			return nil, err
		}
		l = append(l, p)
	}
	return l, rows.Err()
}

func (r *Repo) Pagamento(ctx context.Context, id string) (models.Pagamento, error) {
	p, err := scanPag(r.DB.QueryRowContext(ctx, `SELECT `+colPag+` FROM pagamentos WHERE id = $1`, id))
	return p, naoAchou(err)
}

func (r *Repo) ExistePagamento(ctx context.Context, alunoID, mes string) (bool, error) {
	var ok bool
	err := r.DB.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM pagamentos WHERE aluno_id=$1 AND mes=$2)`, alunoID, mes).Scan(&ok)
	return ok, err
}

func (r *Repo) SalvarPagamento(ctx context.Context, p models.Pagamento) error {
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO pagamentos (id, aluno_id, mes, valor, vencimento, status, pago_em, metodo, informado_em) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		ON CONFLICT (id) DO UPDATE SET valor=$4, vencimento=$5, status=$6, pago_em=$7, metodo=$8, informado_em=$9`,
		p.ID, p.AlunoID, p.Mes, p.Valor, p.Vencimento, p.Status, nulo(p.PagoEm), nulo(p.Metodo), nulo(p.InformadoEm))
	return err
}

// ---------------- presenças ----------------

// PresencasAgenda = combinados de hoje até 30 dias à frente (a agenda mostra os próximos dias).
func (r *Repo) PresencasAgenda(ctx context.Context, hoje string, alunoIDs []string) ([]models.Presenca, error) {
	ate := models.Agora().AddDate(0, 0, 31).Format("2006-01-02")
	rows, err := r.DB.QueryContext(ctx, `SELECT id, aluno_id, data, ida, volta, motivo, avisado_em FROM presencas WHERE data >= $1 AND data <= $3 AND aluno_id = ANY($2)`,
		hoje, pq.Array(alunoIDs), ate)
	if err != nil {
		return nil, err
	}
	return r.lerPresencas(rows)
}

func (r *Repo) PresencasDoDia(ctx context.Context, data string, alunoIDs []string) ([]models.Presenca, error) {
	rows, err := r.DB.QueryContext(ctx, `SELECT id, aluno_id, data, ida, volta, motivo, avisado_em FROM presencas WHERE data = $1 AND aluno_id = ANY($2)`,
		data, pq.Array(alunoIDs))
	if err != nil {
		return nil, err
	}
	return r.lerPresencas(rows)
}

func (r *Repo) lerPresencas(rows *sql.Rows) ([]models.Presenca, error) {
	defer rows.Close()
	l := []models.Presenca{}
	for rows.Next() {
		var p models.Presenca
		var em time.Time
		if err := rows.Scan(&p.ID, &p.AlunoID, &p.Data, &p.Ida, &p.Volta, &p.Motivo, &em); err != nil {
			return nil, err
		}
		p.AvisadoEm = models.Iso(em)
		l = append(l, p)
	}
	return l, rows.Err()
}

func (r *Repo) Presenca(ctx context.Context, alunoID, data string) (*models.Presenca, error) {
	l, err := r.PresencasDoDia(ctx, data, []string{alunoID})
	if err != nil || len(l) == 0 {
		return nil, err
	}
	return &l[0], nil
}

func (r *Repo) SalvarPresenca(ctx context.Context, p models.Presenca) error {
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO presencas (id, aluno_id, data, ida, volta, motivo, avisado_em) VALUES ($1,$2,$3,$4,$5,$6,$7)
		ON CONFLICT (id) DO UPDATE SET ida=$4, volta=$5, motivo=$6, avisado_em=$7`,
		p.ID, p.AlunoID, p.Data, p.Ida, p.Volta, p.Motivo, p.AvisadoEm)
	return err
}

// ---------------- viagens ----------------

func (r *Repo) listarViagens(ctx context.Context, where string, args ...any) ([]models.Viagem, error) {
	rows, err := r.DB.QueryContext(ctx, `SELECT dados FROM viagens WHERE `+where+` ORDER BY dados->>'iniciadaEm'`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	l := []models.Viagem{}
	for rows.Next() {
		var b []byte
		if err := rows.Scan(&b); err != nil {
			return nil, err
		}
		var v models.Viagem
		if err := json.Unmarshal(b, &v); err != nil {
			return nil, err
		}
		l = append(l, v)
	}
	return l, rows.Err()
}

func (r *Repo) Viagem(ctx context.Context, id string) (models.Viagem, error) {
	l, err := r.listarViagens(ctx, `id = $1`, id)
	if err != nil {
		return models.Viagem{}, err
	}
	if len(l) == 0 {
		return models.Viagem{}, core.ErrNaoEncontrado
	}
	return l[0], nil
}

func (r *Repo) ViagensDoDia(ctx context.Context, vanIDs []string, data string) ([]models.Viagem, error) {
	return r.listarViagens(ctx, `van_id = ANY($1) AND data = $2 AND status <> 'cancelada'`, pq.Array(vanIDs), data)
}

func (r *Repo) ViagensAtivasDaVan(ctx context.Context, vanID string) ([]models.Viagem, error) {
	return r.listarViagens(ctx, `van_id = $1 AND status = 'em_andamento'`, vanID)
}

func (r *Repo) ViagensAtivas(ctx context.Context) ([]models.Viagem, error) {
	return r.listarViagens(ctx, `status = 'em_andamento'`)
}

func (r *Repo) SalvarViagem(ctx context.Context, v models.Viagem) error {
	v.Visoes, v.VisoesEscola = nil, nil
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO viagens (id, van_id, data, status, dados, atualizado_em) VALUES ($1,$2,$3,$4,$5, now())
		ON CONFLICT (id) DO UPDATE SET status=$4, dados=$5, atualizado_em=now()`,
		v.ID, v.VanID, v.Data, v.Status, js(v))
	return err
}

// ---------------- notificações ----------------

func (r *Repo) InserirNotificacao(ctx context.Context, n models.Notificacao) error {
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO notificacoes (id, para, aluno_id, van_id, escola_id, icone, titulo, texto, criado_em, lida)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		n.ID, n.Para, nulo(n.AlunoID), nulo(n.VanID), nulo(n.EscolaID), n.Icone, n.Titulo, n.Texto, n.CriadoEm, n.Lida)
	return err
}

// Notificacoes do perfil: pais/aluno pelos alunos; motorista pela van; escola pela escola. Só as últimas 60 dias.
func (r *Repo) Notificacoes(ctx context.Context, para string, alunoIDs []string, vanIDs []string, escolaID string) ([]models.Notificacao, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT id, para, COALESCE(aluno_id,''), COALESCE(van_id,''), COALESCE(escola_id,''), icone, titulo, texto, criado_em, lida
		FROM notificacoes
		WHERE para = $1 AND criado_em > now() - interval '60 days'
		  AND (aluno_id = ANY($2) OR van_id = ANY($3) OR escola_id = $4)
		ORDER BY criado_em DESC LIMIT 200`, para, pq.Array(alunoIDs), pq.Array(vanIDs), escolaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	l := []models.Notificacao{}
	for rows.Next() {
		var n models.Notificacao
		var em time.Time
		if err := rows.Scan(&n.ID, &n.Para, &n.AlunoID, &n.VanID, &n.EscolaID, &n.Icone, &n.Titulo, &n.Texto, &em, &n.Lida); err != nil {
			return nil, err
		}
		n.CriadoEm = models.Iso(em)
		l = append(l, n)
	}
	return l, rows.Err()
}

func (r *Repo) MarcarNotificacoesLidas(ctx context.Context, para string, alunoIDs []string, vanIDs []string, escolaID string) error {
	_, err := r.DB.ExecContext(ctx, `UPDATE notificacoes SET lida = TRUE WHERE NOT lida AND para = $1
		AND (aluno_id = ANY($2) OR van_id = ANY($3) OR escola_id = $4)`, para, pq.Array(alunoIDs), pq.Array(vanIDs), escolaID)
	return err
}

// ---------------- mensagens ----------------

func (r *Repo) InserirMensagem(ctx context.Context, m models.Mensagem) error {
	_, err := r.DB.ExecContext(ctx, `INSERT INTO mensagens (id, aluno_id, de, texto, criado_em, lida) VALUES ($1,$2,$3,$4,$5,$6)`,
		m.ID, m.AlunoID, m.De, m.Texto, m.CriadoEm, m.Lida)
	return err
}

func (r *Repo) MensagensDosAlunos(ctx context.Context, ids []string) ([]models.Mensagem, error) {
	rows, err := r.DB.QueryContext(ctx, `SELECT id, aluno_id, de, texto, criado_em, lida FROM mensagens WHERE aluno_id = ANY($1) ORDER BY criado_em`, pq.Array(ids))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	l := []models.Mensagem{}
	for rows.Next() {
		var m models.Mensagem
		var em time.Time
		if err := rows.Scan(&m.ID, &m.AlunoID, &m.De, &m.Texto, &em, &m.Lida); err != nil {
			return nil, err
		}
		m.CriadoEm = models.Iso(em)
		l = append(l, m)
	}
	return l, rows.Err()
}

func (r *Repo) LerMensagens(ctx context.Context, alunoID, de string) error {
	_, err := r.DB.ExecContext(ctx, `UPDATE mensagens SET lida = TRUE WHERE aluno_id = $1 AND de = $2 AND NOT lida`, alunoID, de)
	return err
}

// ---------------- pontos ----------------

// InserirPontos devolve false se o id já existia (pontos automáticos do dia não repetem).
func (r *Repo) InserirPontos(ctx context.Context, e models.EventoPontos) (bool, error) {
	res, err := r.DB.ExecContext(ctx, `
		INSERT INTO pontos (id, aluno_id, van_id, data, criado_em, tipo, pontos, descricao, observacao, autor)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
		e.ID, e.AlunoID, e.VanID, e.Data, e.CriadoEm, e.Tipo, e.Pontos, e.Descricao, e.Observacao, e.Autor)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

func (r *Repo) listarPontos(ctx context.Context, where string, args ...any) ([]models.EventoPontos, error) {
	rows, err := r.DB.QueryContext(ctx, `SELECT id, aluno_id, van_id, data, criado_em, tipo, pontos, descricao, observacao, autor FROM pontos WHERE `+where+` ORDER BY criado_em`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	l := []models.EventoPontos{}
	for rows.Next() {
		var e models.EventoPontos
		var em time.Time
		if err := rows.Scan(&e.ID, &e.AlunoID, &e.VanID, &e.Data, &em, &e.Tipo, &e.Pontos, &e.Descricao, &e.Observacao, &e.Autor); err != nil {
			return nil, err
		}
		e.CriadoEm = models.Iso(em)
		l = append(l, e)
	}
	return l, rows.Err()
}

func (r *Repo) PontosDasVans(ctx context.Context, vanIDs []string) ([]models.EventoPontos, error) {
	return r.listarPontos(ctx, `van_id = ANY($1)`, pq.Array(vanIDs))
}

func (r *Repo) PontosDosAlunos(ctx context.Context, ids []string) ([]models.EventoPontos, error) {
	return r.listarPontos(ctx, `aluno_id = ANY($1)`, pq.Array(ids))
}

// ---------------- recompensas e resgates ----------------

func (r *Repo) Recompensas(ctx context.Context, vanIDs []string) ([]models.Recompensa, error) {
	rows, err := r.DB.QueryContext(ctx, `SELECT id, van_id, icone, nome, custo, ativo FROM recompensas WHERE van_id = ANY($1) ORDER BY custo`, pq.Array(vanIDs))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	l := []models.Recompensa{}
	for rows.Next() {
		var x models.Recompensa
		if err := rows.Scan(&x.ID, &x.VanID, &x.Icone, &x.Nome, &x.Custo, &x.Ativo); err != nil {
			return nil, err
		}
		l = append(l, x)
	}
	return l, rows.Err()
}

func (r *Repo) Recompensa(ctx context.Context, id string) (models.Recompensa, error) {
	var x models.Recompensa
	err := r.DB.QueryRowContext(ctx, `SELECT id, van_id, icone, nome, custo, ativo FROM recompensas WHERE id = $1`, id).
		Scan(&x.ID, &x.VanID, &x.Icone, &x.Nome, &x.Custo, &x.Ativo)
	return x, naoAchou(err)
}

func (r *Repo) SalvarRecompensa(ctx context.Context, x models.Recompensa) error {
	_, err := r.DB.ExecContext(ctx, `INSERT INTO recompensas (id, van_id, icone, nome, custo, ativo) VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (id) DO UPDATE SET icone=$3, nome=$4, custo=$5, ativo=$6`, x.ID, x.VanID, x.Icone, x.Nome, x.Custo, x.Ativo)
	return err
}

func (r *Repo) Resgates(ctx context.Context, alunoIDs []string) ([]models.Resgate, error) {
	rows, err := r.DB.QueryContext(ctx, `SELECT id, aluno_id, recompensa_id, nome, icone, custo, status, criado_em, decidido_em
		FROM resgates WHERE aluno_id = ANY($1) ORDER BY criado_em DESC`, pq.Array(alunoIDs))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	l := []models.Resgate{}
	for rows.Next() {
		var x models.Resgate
		var em time.Time
		var dec sql.NullTime
		if err := rows.Scan(&x.ID, &x.AlunoID, &x.RecompensaID, &x.Nome, &x.Icone, &x.Custo, &x.Status, &em, &dec); err != nil {
			return nil, err
		}
		x.CriadoEm, x.DecididoEm = models.Iso(em), isoNulo(dec)
		l = append(l, x)
	}
	return l, rows.Err()
}

func (r *Repo) Resgate(ctx context.Context, id string) (models.Resgate, error) {
	l, err := r.DB.QueryContext(ctx, `SELECT aluno_id FROM resgates WHERE id = $1`, id)
	if err != nil {
		return models.Resgate{}, err
	}
	var alunoID string
	if l.Next() {
		_ = l.Scan(&alunoID)
	}
	l.Close()
	if alunoID == "" {
		return models.Resgate{}, core.ErrNaoEncontrado
	}
	todos, err := r.Resgates(ctx, []string{alunoID})
	for _, x := range todos {
		if x.ID == id {
			return x, err
		}
	}
	return models.Resgate{}, core.ErrNaoEncontrado
}

func (r *Repo) SalvarResgate(ctx context.Context, x models.Resgate) error {
	_, err := r.DB.ExecContext(ctx, `INSERT INTO resgates (id, aluno_id, recompensa_id, nome, icone, custo, status, criado_em, decidido_em)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO UPDATE SET status=$7, decidido_em=$9`,
		x.ID, x.AlunoID, x.RecompensaID, x.Nome, x.Icone, x.Custo, x.Status, x.CriadoEm, nulo(x.DecididoEm))
	return err
}

// ApagarDemo remove a van de demonstração e tudo dela (para recriar os dados de exemplo).
func (r *Repo) ApagarDemo(ctx context.Context) error {
	_, err := r.DB.ExecContext(ctx, `
		DELETE FROM notificacoes WHERE van_id IN (SELECT id FROM vans WHERE demo)
		   OR aluno_id IN (SELECT a.id FROM alunos a JOIN vans v ON v.id = a.van_id WHERE v.demo)
		   OR escola_id IN ('esc-santa-maria','esc-horizonte','esc-roberto');
		DELETE FROM pontos WHERE van_id IN (SELECT id FROM vans WHERE demo);
		DELETE FROM usuarios WHERE demo;
		DELETE FROM vans WHERE demo;
		DELETE FROM escolas WHERE id IN ('esc-santa-maria','esc-horizonte','esc-roberto')
		  AND NOT EXISTS (SELECT 1 FROM alunos WHERE escola_id = escolas.id);`)
	return err
}
