// VanAaki API — Go + Postgres + tempo real (SSE).
//
//	go run ./cmd/api        (precisa do Postgres: docker compose up -d banco)
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	_ "time/tzdata" // fuso de São Paulo mesmo em imagem Docker mínima

	"github.com/logdrive023/vanaaki/backend/internal/config"
	"github.com/logdrive023/vanaaki/backend/internal/container"
	"github.com/logdrive023/vanaaki/backend/internal/database"
	"github.com/logdrive023/vanaaki/backend/internal/server"
)

func main() {
	cfg := config.Carregar()
	db, err := database.Abrir(cfg.BancoURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if err := database.Migrar(db); err != nil {
		log.Fatal(err)
	}

	c := container.New(cfg, db)
	ctx, parar := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer parar()

	if cfg.Demo {
		if err := c.Demo.Garantir(ctx); err != nil {
			log.Fatalf("dados de demonstração: %v", err)
		}
	}
	go c.Viagens.Simular(ctx) // anda com as vans em modo demonstração
	go limparHistorico(ctx, c) // PL 1240/2026: guarda os trajetos pelo prazo e apaga o que passou

	srv := server.New(c)
	go func() {
		log.Printf("VanAaki API ouvindo em :%s (demo=%v)", cfg.Porta, cfg.Demo)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()
	<-ctx.Done()
	desligar, cancelar := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelar()
	_ = srv.Shutdown(desligar)
	log.Println("até logo")
}

// limparHistorico apaga, uma vez por dia, as posições mais velhas que o prazo de guarda.
func limparHistorico(ctx context.Context, c *container.Container) {
	tk := time.NewTicker(24 * time.Hour)
	defer tk.Stop()
	for {
		if n, err := c.Conformidade.Limpar(ctx); err != nil {
			log.Printf("limpeza do histórico: %v", err)
		} else if n > 0 {
			log.Printf("histórico: %d posições antigas apagadas", n)
		}
		select {
		case <-ctx.Done():
			return
		case <-tk.C:
		}
	}
}
