// Package core tem o formato padrão das respostas e os erros com status HTTP.
//
// Toda resposta sai como {"sucesso": bool, "msg": "...", "dados": ...}.
package core

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
)

// Erro carrega o status HTTP e a mensagem que pode ir para a tela.
type Erro struct {
	Status int
	Msg    string
}

func (e *Erro) Error() string { return e.Msg }

func NovoErro(status int, msg string) *Erro { return &Erro{Status: status, Msg: msg} }

var (
	ErrNaoAutorizado = NovoErro(http.StatusUnauthorized, "Entre de novo para continuar.")
	ErrProibido      = NovoErro(http.StatusForbidden, "Você não tem acesso a isso.")
	ErrNaoEncontrado = NovoErro(http.StatusNotFound, "Não encontrado.")
)

// Invalido = 400 com mensagem.
func Invalido(msg string) *Erro { return NovoErro(http.StatusBadRequest, msg) }

type resposta struct {
	Sucesso bool   `json:"sucesso"`
	Msg     string `json:"msg,omitempty"`
	Dados   any    `json:"dados,omitempty"`
}

// Responder escreve as respostas de um handler.
type Responder struct{ W http.ResponseWriter }

func (r Responder) OK(dados any) { JSON(r.W, http.StatusOK, resposta{Sucesso: true, Dados: dados}) }

func (r Responder) Criado(dados any) {
	JSON(r.W, http.StatusCreated, resposta{Sucesso: true, Dados: dados})
}

// Erro converte qualquer erro: *Erro mantém status e texto; o resto vira 500 genérico (e vai pro log).
func (r Responder) Erro(err error) {
	var e *Erro
	if errors.As(err, &e) {
		JSON(r.W, e.Status, resposta{Msg: e.Msg})
		return
	}
	log.Printf("erro interno: %v", err)
	JSON(r.W, http.StatusInternalServerError, resposta{Msg: "Algo deu errado. Tente de novo."})
}

func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
