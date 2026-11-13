package entities

import "github.com/logdrive023/vanaaki/backend/internal/models"

type IniciarRequest struct {
	Turno      models.Turno `json:"turno"`
	Tipo       string       `json:"tipo"`
	Otimizar   bool         `json:"otimizar"`
	Automatico bool         `json:"automatico"`
	Velocidade float64      `json:"velocidade"`
	// true = o servidor anda com a van (demonstração); false = GPS do celular
	Simulado bool `json:"simulado"`
}

type ParadaRequest struct {
	Status string `json:"status"` // feito | ausente
}

type ConfigurarRequest struct {
	Automatico *bool    `json:"automatico"`
	Velocidade *float64 `json:"velocidade"`
	Simulado   *bool    `json:"simulado"`
}

type PosicaoRequest struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

// PosicoesRequest: posições guardadas pelo celular quando ficou sem internet.
type PosicoesRequest struct {
	Pontos []models.PontoTrajeto `json:"pontos"`
}

type EntradaRequest struct {
	AlunoIDs []string `json:"alunoIds"`
}

type ProntoRequest struct {
	AlunoID string `json:"alunoId"`
}
