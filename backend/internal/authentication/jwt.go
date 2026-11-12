// Package authentication gera e valida o token de acesso (JWT HS256) e a senha (bcrypt).
package authentication

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type Claims struct {
	Perfil string `json:"perfil"`
	jwt.RegisteredClaims
}

type Tokens struct{ segredo []byte }

func New(segredo string) *Tokens { return &Tokens{segredo: []byte(segredo)} }

// Gerar cria um token de 30 dias (app de celular: a família não deve ter que logar toda hora).
func (t *Tokens) Gerar(usuarioID, perfil string) (string, error) {
	c := Claims{Perfil: perfil, RegisteredClaims: jwt.RegisteredClaims{
		Subject:   usuarioID,
		IssuedAt:  jwt.NewNumericDate(time.Now()),
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(30 * 24 * time.Hour)),
		Issuer:    "vanaaki",
	}}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString(t.segredo)
}

// Validar devolve o id do usuário dono do token.
func (t *Tokens) Validar(token string) (*Claims, error) {
	c := &Claims{}
	tk, err := jwt.ParseWithClaims(token, c, func(tk *jwt.Token) (any, error) {
		if tk.Method != jwt.SigningMethodHS256 {
			return nil, errors.New("algoritmo inesperado")
		}
		return t.segredo, nil
	})
	if err != nil || !tk.Valid {
		return nil, errors.New("token inválido")
	}
	return c, nil
}

func HashSenha(senha string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(senha), bcrypt.DefaultCost)
	return string(b), err
}

func ConfereSenha(hash, senha string) bool {
	return hash != "" && bcrypt.CompareHashAndPassword([]byte(hash), []byte(senha)) == nil
}
