package entities

import "github.com/logdrive023/vanaaki/backend/internal/models"

type EntrarRequest struct {
	Email string `json:"email"`
	Senha string `json:"senha"`
}

type CadastroMotoristaRequest struct {
	Nome     string        `json:"nome"`
	Email    string        `json:"email"`
	Senha    string        `json:"senha"`
	Telefone string        `json:"telefone"`
	NomeVan  string        `json:"nomeVan"`
	Placa    string        `json:"placa"`
	Modelo   string        `json:"modelo"`
	Garagem  models.LatLng `json:"garagem"`
}

// CadastroComCodigoRequest: família (código do convite do aluno) ou escola (código da escola).
type CadastroComCodigoRequest struct {
	Codigo   string `json:"codigo"`
	Nome     string `json:"nome"`
	Email    string `json:"email"`
	Senha    string `json:"senha"`
	Telefone string `json:"telefone"`
}

type CodigoRequest struct {
	Codigo string `json:"codigo"`
}

type DemoRequest struct {
	Perfil string `json:"perfil"`
}

type Sessao struct {
	Token   string         `json:"token"`
	Usuario models.Usuario `json:"usuario"`
}
