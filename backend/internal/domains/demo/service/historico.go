package service

import (
	"context"
	"math/rand"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/regras"
	"github.com/logdrive023/vanaaki/backend/internal/models"
	"github.com/logdrive023/vanaaki/backend/pkg/geo"
)

// historicoDemo cria as viagens das últimas semanas (já concluídas) com as posições registradas,
// para o relatório de fiscalização (PL 1240/2026) já abrir com dados.
func (s *Service) historicoDemo(ctx context.Context, van models.Van, alunos []models.Aluno, escolas map[string]models.Escola, dias int) (int, error) {
	r := rand.New(rand.NewSource(7))
	n := 0
	for k := dias; k >= 1; k-- {
		d := models.Agora().AddDate(0, 0, -k)
		if d.Weekday() == time.Saturday || d.Weekday() == time.Sunday {
			continue
		}
		for _, t := range van.Turnos {
			if !t.Ativo || t.Turno == models.Noite {
				continue
			}
			var doTurno []models.Aluno
			for _, a := range alunos {
				if a.Turno == t.Turno && models.Contem(t.EscolaIDs, a.EscolaID) && r.Float64() > 0.06 {
					doTurno = append(doTurno, a)
				}
			}
			if len(doTurno) == 0 {
				continue
			}
			for _, tipo := range []string{"ida", "volta"} {
				if err := s.viagemPassada(ctx, r, van, t.Turno, tipo, d, doTurno, escolas); err != nil {
					return n, err
				}
				n++
			}
		}
	}
	return n, nil
}

func (s *Service) viagemPassada(ctx context.Context, r *rand.Rand, van models.Van, turno models.Turno, tipo string, dia time.Time, alunos []models.Aluno, escolas map[string]models.Escola) error {
	// escolas na ordem do horário (entrada na ida, saída na volta)
	var esc []models.Escola
	vistos := map[string]bool{}
	for _, a := range alunos {
		if e, ok := escolas[a.EscolaID]; ok && !vistos[e.ID] {
			vistos[e.ID] = true
			esc = append(esc, e)
		}
	}
	sort.Slice(esc, func(i, j int) bool {
		return regras.Minutos(regras.HorarioAlvo(esc[i], turno, tipo)) < regras.Minutos(regras.HorarioAlvo(esc[j], turno, tipo))
	})
	casas := make([]geo.P, len(alunos))
	for i, a := range alunos {
		casas[i] = a.Local
	}
	var paradas []models.Parada
	var pts []geo.P
	if tipo == "ida" {
		ordem := geo.OtimizarOrdem(van.Garagem, casas, esc[0].Local)
		pts = append(pts, van.Garagem)
		for _, i := range ordem {
			paradas = append(paradas, models.Parada{Tipo: "aluno", AlunoID: alunos[i].ID, EscolaID: alunos[i].EscolaID, Status: "feito"})
			pts = append(pts, casas[i])
		}
		for _, e := range esc {
			paradas = append(paradas, models.Parada{Tipo: "escola", EscolaID: e.ID, Status: "feito"})
			pts = append(pts, e.Local)
		}
	} else {
		for _, e := range esc {
			paradas = append(paradas, models.Parada{Tipo: "escola", EscolaID: e.ID, Status: "feito"})
			pts = append(pts, e.Local)
		}
		ordem := geo.OtimizarOrdem(esc[len(esc)-1].Local, casas, van.Garagem)
		for _, i := range ordem {
			paradas = append(paradas, models.Parada{Tipo: "aluno", AlunoID: alunos[i].ID, EscolaID: alunos[i].EscolaID, Status: "feito"})
			pts = append(pts, casas[i])
		}
		pts = append(pts, van.Garagem)
	}

	// trajeto "pelas quadras": cada trecho vira um L (anda na latitude e depois na longitude)
	var trilha []geo.P
	parouEm := []int{} // índice na trilha de cada parada
	for i := 1; i < len(pts); i++ {
		a, b := pts[i-1], pts[i]
		canto := geo.P{Lat: b.Lat, Lng: a.Lng}
		if r.Intn(2) == 0 {
			canto = geo.P{Lat: a.Lat, Lng: b.Lng}
		}
		for _, seg := range [][2]geo.P{{a, canto}, {canto, b}} {
			dist := geo.DistM(seg[0], seg[1])
			passos := int(dist/110) + 1
			for k := 0; k < passos; k++ {
				f := float64(k) / float64(passos)
				trilha = append(trilha, geo.P{Lat: seg[0].Lat + (seg[1].Lat-seg[0].Lat)*f, Lng: seg[0].Lng + (seg[1].Lng-seg[0].Lng)*f})
			}
		}
		parouEm = append(parouEm, len(trilha))
	}
	trilha = append(trilha, pts[len(pts)-1])

	// horário: na ida chega 5 min antes da 1ª entrada; na volta sai na 1ª saída
	velMs := (20 + r.Float64()*8) / 3.6
	total := 0.0
	for i := 1; i < len(trilha); i++ {
		total += geo.DistM(trilha[i-1], trilha[i])
	}
	duracao := time.Duration(total/velMs)*time.Second + time.Duration(len(paradas))*time.Minute
	alvo := regras.Minutos(regras.HorarioAlvo(esc[0], turno, tipo))
	base := time.Date(dia.Year(), dia.Month(), dia.Day(), 0, 0, 0, 0, models.Fuso).Add(time.Duration(alvo) * time.Minute)
	inicio := base
	if tipo == "ida" {
		inicio = base.Add(-duracao - 5*time.Minute)
	}
	inicio = inicio.Add(time.Duration(r.Intn(240)-120) * time.Second)

	pontos := make([]models.PontoTrajeto, 0, len(trilha))
	t := inicio
	prox := 0
	for i, p := range trilha {
		if i > 0 {
			t = t.Add(time.Duration(geo.DistM(trilha[i-1], p)/velMs*1000) * time.Millisecond)
		}
		for prox < len(parouEm) && i == parouEm[prox] {
			paradas[prox].Hora = models.Iso(t)
			t = t.Add(time.Duration(40+r.Intn(60)) * time.Second)
			prox++
		}
		pontos = append(pontos, models.PontoTrajeto{Lat: p.Lat, Lng: p.Lng, Em: models.Iso(t)})
	}
	for ; prox < len(paradas); prox++ {
		paradas[prox].Hora = models.Iso(t)
	}
	escIDs := make([]string, len(esc))
	for i, e := range esc {
		escIDs[i] = e.ID
	}
	destinoNome := "Garagem"
	if tipo == "ida" {
		destinoNome = esc[len(esc)-1].Nome
	}
	v := models.Viagem{
		ID: uuid.NewString(), VanID: van.ID, Data: dia.Format("2006-01-02"), Tipo: tipo, Turno: turno, Status: "concluida",
		Inicio: pts[0], EscolaIDs: escIDs, Destino: pts[len(pts)-1], DestinoNome: destinoNome, Paradas: paradas, Alvo: len(paradas),
		Pos: pts[len(pts)-1], Caminho: []models.LatLng{}, Trechos: map[string][]models.LatLng{}, RotaReal: true, Rastro: []models.LatLng{},
		IniciadaEm: models.Iso(inicio), ConcluidaEm: models.Iso(t), Avisados: []string{}, AtualizadoEm: models.Iso(t), Velocidade: 1,
	}
	if err := s.repo.SalvarViagem(ctx, v); err != nil {
		return err
	}
	return s.repo.InserirPosicoes(ctx, v.ID, van.ID, "gps", pontos)
}
