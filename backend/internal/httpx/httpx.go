// Package httpx tem os ajudantes de request: ler JSON, parâmetros e o usuário logado.
package httpx

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
	"github.com/logdrive023/vanaaki/backend/internal/core"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

// Bind lê o corpo JSON (até 1 MB) em v.
func Bind(r *http.Request, v any) error {
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	if err := dec.Decode(v); err != nil {
		return core.Invalido("Dados inválidos.")
	}
	return nil
}

// Param = variável da rota ({id}).
func Param(r *http.Request, nome string) string { return mux.Vars(r)[nome] }

// Query = parâmetro da URL (?q=).
func Query(r *http.Request, nome string) string { return strings.TrimSpace(r.URL.Query().Get(nome)) }

type chave int

const chaveEscopo chave = 1

// ComEscopo guarda o escopo do usuário no contexto (feito pelo middleware de autenticação).
func ComEscopo(ctx context.Context, e models.Escopo) context.Context {
	return context.WithValue(ctx, chaveEscopo, e)
}

// Escopo devolve o usuário logado e o que ele pode ver.
func Escopo(r *http.Request) models.Escopo {
	e, _ := r.Context().Value(chaveEscopo).(models.Escopo)
	return e
}

// Acao lê o corpo em T, chama f com o escopo do usuário e responde {sucesso, dados}.
func Acao[T any](w http.ResponseWriter, r *http.Request, f func(ctx context.Context, e models.Escopo, req T) (any, error)) {
	var req T
	if r.ContentLength != 0 {
		if err := Bind(r, &req); err != nil {
			core.Responder{W: w}.Erro(err)
			return
		}
	}
	dados, err := f(r.Context(), Escopo(r), req)
	if err != nil {
		core.Responder{W: w}.Erro(err)
		return
	}
	core.Responder{W: w}.OK(dados)
}

// Vazio = corpo sem campos.
type Vazio struct{}
