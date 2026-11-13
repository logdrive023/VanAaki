package entities

import "github.com/logdrive023/vanaaki/backend/internal/models"

type VanRequest struct {
	Nome        string        `json:"nome"`
	Motorista   string        `json:"motorista"`
	Telefone    string        `json:"telefone"`
	Placa       string        `json:"placa"`
	Modelo      string        `json:"modelo"`
	Garagem     models.LatLng `json:"garagem"`
	PrecoPadrao int           `json:"precoPadrao"`
	Vagas       int           `json:"vagas"`
}

type ConfigRequest = models.ConfigVan

type TurnosRequest struct {
	Turnos []models.TurnoVan `json:"turnos"`
}

type RotaFixaRequest struct {
	Turno models.Turno `json:"turno"`
	Tipo  string       `json:"tipo"`
	Ativa *bool        `json:"ativa"`
	Ordem []string     `json:"ordem"`
}

type ArquivarRequest struct {
	Ativo bool `json:"ativo"`
}

type PresencaRequest struct {
	AlunoID string `json:"alunoId"`
	Plano   string `json:"plano"` // ambos | so_ida | so_volta | nao_vai
	Motivo  string `json:"motivo"`
	// dia do combinado (AAAA-MM-DD). Vazio = hoje. Até 30 dias à frente (agenda).
	Data string `json:"data"`
}
