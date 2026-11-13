// Package config lê as configurações do ambiente (com valores padrão para rodar local).
package config

import (
	"os"
	"strings"
)

type Config struct {
	Porta      string
	BancoURL   string
	JWTSegredo string
	// origens liberadas no CORS (vírgula); "*" libera todas
	Origens []string
	// DEMO=true cria os dados de exemplo e libera o login de teste
	Demo bool
	// servidor de rotas (OSRM, dados do OpenStreetMap)
	OSRM string
	// busca de endereço (Nominatim, OpenStreetMap)
	Nominatim string
}

func Carregar() Config {
	return Config{
		Porta:      env("PORT", "8090"),
		BancoURL:   env("DATABASE_URL", "postgres://vanaaki:vanaaki@localhost:5434/vanaaki?sslmode=disable"),
		JWTSegredo: env("JWT_SECRET", "troque-este-segredo-em-producao"),
		Origens:    strings.Split(env("CORS_ORIGINS", "*"), ","),
		Demo:       env("DEMO", "true") == "true",
		OSRM:       env("OSRM_URL", "https://router.project-osrm.org"),
		Nominatim:  env("NOMINATIM_URL", "https://nominatim.openstreetmap.org"),
	}
}

func env(k, padrao string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return padrao
}
