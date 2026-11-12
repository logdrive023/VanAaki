package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/logdrive023/vanaaki/backend/internal/core"
	"github.com/logdrive023/vanaaki/backend/internal/domains/sincronizacao/service"
	"github.com/logdrive023/vanaaki/backend/internal/httpx"
	"github.com/logdrive023/vanaaki/backend/internal/models"
	"github.com/logdrive023/vanaaki/backend/internal/realtime"
)

type Router struct {
	s         service.Service
	hub       *realtime.Hub
	nominatim string
	http      *http.Client
}

func NewRouter(s service.Service, h *realtime.Hub, nominatim string) *Router {
	return &Router{s: s, hub: h, nominatim: strings.TrimRight(nominatim, "/"), http: &http.Client{Timeout: 8 * time.Second}}
}

func (rt *Router) sync(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, _ httpx.Vazio) (any, error) { return rt.s.Pacote(ctx, e) })
}

func (rt *Router) eventos(w http.ResponseWriter, r *http.Request) {
	rt.hub.Servir(w, r, httpx.Escopo(r))
}

type lugar struct {
	Nome  string        `json:"nome"`
	Local models.LatLng `json:"local"`
}

// buscar endereço → coordenadas (Nominatim/OpenStreetMap). Só o texto digitado vai para fora.
func (rt *Router) buscarEndereco(w http.ResponseWriter, r *http.Request) {
	q := httpx.Query(r, "q")
	if len(q) < 4 {
		core.Responder{W: w}.OK([]lugar{})
		return
	}
	u := rt.nominatim + "/search?format=jsonv2&limit=5&countrycodes=br&accept-language=pt-BR&q=" + url.QueryEscape(q)
	req, _ := http.NewRequestWithContext(r.Context(), http.MethodGet, u, nil)
	req.Header.Set("User-Agent", "vanaaki-api/1.0")
	res, err := rt.http.Do(req)
	if err != nil {
		core.Responder{W: w}.Erro(core.NovoErro(http.StatusBadGateway, "Busca de endereço indisponível. Marque no mapa."))
		return
	}
	defer res.Body.Close()
	var l []struct {
		DisplayName string `json:"display_name"`
		Lat         string `json:"lat"`
		Lon         string `json:"lon"`
	}
	_ = json.NewDecoder(res.Body).Decode(&l)
	out := []lugar{}
	for _, x := range l {
		var p models.LatLng
		_ = json.Unmarshal([]byte(x.Lat), &p.Lat)
		_ = json.Unmarshal([]byte(x.Lon), &p.Lng)
		out = append(out, lugar{Nome: x.DisplayName, Local: p})
	}
	core.Responder{W: w}.OK(out)
}

func (rt *Router) Register(api *mux.Router) {
	api.HandleFunc("/sync", rt.sync).Methods("GET")
	api.HandleFunc("/eventos", rt.eventos).Methods("GET")
	api.HandleFunc("/geo/buscar", rt.buscarEndereco).Methods("GET")
}
