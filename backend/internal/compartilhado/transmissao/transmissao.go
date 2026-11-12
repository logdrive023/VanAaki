// Package transmissao monta o que cada pessoa pode ver e avisa os aparelhos conectados.
//
// O tio recebe a viagem inteira. A família recebe só a parada do filho e da escola dele, a "visão"
// já calculada (fase, previsão, paradas antes) e a posição da van SÓ quando o próximo destino é dela.
// A escola recebe só as paradas dela e dos alunos dela.
package transmissao

import (
	"context"
	"log"

	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/regras"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/repositorio"
	"github.com/logdrive023/vanaaki/backend/internal/models"
	"github.com/logdrive023/vanaaki/backend/internal/realtime"
)

type T struct {
	repo *repositorio.Repo
	hub  *realtime.Hub
}

func New(r *repositorio.Repo, h *realtime.Hub) *T { return &T{repo: r, hub: h} }

// Van avisa todos que acompanham a van (tio, famílias e escolas dela) para buscarem os dados.
func (t *T) Van(ctx context.Context, vanID string) {
	v, err := t.repo.Van(ctx, vanID)
	if err != nil {
		return
	}
	t.hub.Sincronizar(realtime.Alvo{VanID: vanID, EscolaIDs: v.EscolaIDs})
}

// Escola avisa a escola (e as vans dela).
func (t *T) Escola(ctx context.Context, escolaID string) {
	vans, _ := t.repo.VansDaEscola(ctx, escolaID)
	t.hub.Sincronizar(realtime.Alvo{EscolaIDs: []string{escolaID}})
	for _, v := range vans {
		t.hub.Sincronizar(realtime.Alvo{VanID: v.ID})
	}
}

// Locais = alunos e escolas de uma viagem (para calcular as visões).
type Locais struct {
	Alunos  map[string]models.Aluno
	Escolas map[string]models.Escola
}

func (t *T) Locais(ctx context.Context, v *models.Viagem) Locais {
	ids := []string{}
	for _, p := range v.Paradas {
		if p.Tipo == "aluno" {
			ids = append(ids, p.AlunoID)
		}
	}
	al, err := t.repo.MapaAlunos(ctx, ids)
	if err != nil {
		log.Printf("locais: %v", err)
	}
	es, _ := t.repo.MapaEscolas(ctx, v.EscolaIDs)
	return Locais{Alunos: al, Escolas: es}
}

// ParaFamilia devolve a viagem só com o que a família pode ver (ok=false se nenhum filho está nela).
func ParaFamilia(v models.Viagem, alunoIDs []string, L Locais) (models.Viagem, bool) {
	visoes := map[string]models.VisaoFamilia{}
	escolas := map[string]bool{}
	for _, id := range alunoIDs {
		if regras.IdxAluno(&v, id) < 0 {
			continue
		}
		a, ok := L.Alunos[id]
		if !ok {
			continue
		}
		var e *models.Escola
		if x, ok := L.Escolas[a.EscolaID]; ok {
			e = &x
		}
		visoes[id] = regras.VisaoFamilia(&v, a, e)
		escolas[a.EscolaID] = true
	}
	if len(visoes) == 0 {
		return models.Viagem{}, false
	}
	out := models.Viagem{
		ID: v.ID, VanID: v.VanID, Data: v.Data, Tipo: v.Tipo, Status: v.Status, Turno: v.Turno,
		Paradas: []models.Parada{}, Alvo: -1, Caminho: []models.LatLng{}, Trechos: map[string][]models.LatLng{},
		Rastro: []models.LatLng{}, Avisados: []string{}, RotaReal: v.RotaReal, NaParada: false,
		IniciadaEm: v.IniciadaEm, ConcluidaEm: v.ConcluidaEm, AtualizadoEm: v.AtualizadoEm, Velocidade: v.Velocidade,
		EscolaIDs: []string{}, Visoes: visoes,
	}
	for _, p := range v.Paradas {
		if (p.Tipo == "aluno" && models.Contem(alunoIDs, p.AlunoID)) || (p.Tipo == "escola" && escolas[p.EscolaID]) {
			out.Paradas = append(out.Paradas, p)
		}
	}
	for id := range escolas {
		out.EscolaIDs = append(out.EscolaIDs, id)
	}
	for _, a := range v.Avisados {
		if models.Contem(alunoIDs, a) {
			out.Avisados = append(out.Avisados, a)
		}
	}
	// posição da van só quando o próximo destino é desta família
	for _, vis := range visoes {
		if vis.MostrarMapa {
			out.Pos, out.Caminho = v.Pos, vis.Caminho
			break
		}
	}
	return out, true
}

// ParaEscola devolve a viagem com só as paradas da escola e dos alunos dela.
func ParaEscola(v models.Viagem, escolaID string, L Locais) (models.Viagem, bool) {
	e, ok := L.Escolas[escolaID]
	if !ok || regras.IdxEscola(&v, escolaID) < 0 {
		return models.Viagem{}, false
	}
	ve := regras.VisaoEscola(&v, e)
	out := models.Viagem{
		ID: v.ID, VanID: v.VanID, Data: v.Data, Tipo: v.Tipo, Status: v.Status, Turno: v.Turno,
		Paradas: []models.Parada{}, Alvo: -1, Caminho: []models.LatLng{}, Trechos: map[string][]models.LatLng{},
		Rastro: []models.LatLng{}, Avisados: []string{}, RotaReal: v.RotaReal,
		IniciadaEm: v.IniciadaEm, ConcluidaEm: v.ConcluidaEm, AtualizadoEm: v.AtualizadoEm, Velocidade: v.Velocidade,
		EscolaIDs: []string{escolaID}, VisoesEscola: map[string]models.VisaoEscola{escolaID: ve},
	}
	for _, p := range v.Paradas {
		if p.EscolaID == escolaID {
			out.Paradas = append(out.Paradas, p)
		}
	}
	if ve.MostrarMapa {
		out.Pos = v.Pos
	}
	return out, true
}

// Movimento = o que muda a cada segundo (para o tio não baixar a viagem inteira toda hora).
type Movimento struct {
	ID             string          `json:"id"`
	Pos            models.LatLng   `json:"pos"`
	Caminho        []models.LatLng `json:"caminho"`
	NaParada       bool            `json:"naParada"`
	ChegouParadaEm string          `json:"chegouParadaEm,omitempty"`
	Alvo           int             `json:"alvo"`
	AtualizadoEm   string          `json:"atualizadoEm"`
}

// Viagem manda a viagem para todos os interessados, cada um com a sua versão.
// soMovimento=true: o tio recebe só a posição (o resto ele já tem).
func (t *T) Viagem(ctx context.Context, v models.Viagem, soMovimento bool) {
	L := t.Locais(ctx, &v)
	alvo := realtime.Alvo{VanID: v.VanID, EscolaIDs: v.EscolaIDs}
	t.hub.PorCliente(alvo, "viagem", func(e models.Escopo) (any, bool) {
		switch e.Usuario.Perfil {
		case models.PerfilMotorista:
			if soMovimento {
				return nil, false
			}
			return v, true
		case models.PerfilPais, models.PerfilAluno:
			return ParaFamilia(v, e.AlunoIDs, L)
		case models.PerfilEscola:
			return ParaEscola(v, e.EscolaID, L)
		}
		return nil, false
	})
	if soMovimento {
		mov := Movimento{ID: v.ID, Pos: v.Pos, Caminho: v.Caminho, NaParada: v.NaParada, ChegouParadaEm: v.ChegouParadaEm, Alvo: v.Alvo, AtualizadoEm: v.AtualizadoEm}
		t.hub.PorCliente(realtime.Alvo{VanID: v.VanID}, "mov", func(e models.Escopo) (any, bool) {
			return mov, e.Usuario.Perfil == models.PerfilMotorista
		})
	}
}
