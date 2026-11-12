// Package osrm chama o roteador OSRM (dados do OpenStreetMap, sem chave nem custo).
// Só manda coordenadas — nenhum dado de pessoa.
package osrm

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/logdrive023/vanaaki/backend/internal/models"
)

type P = models.LatLng

type Cliente struct {
	base string
	http *http.Client
}

func New(base string) *Cliente {
	return &Cliente{base: strings.TrimRight(base, "/"), http: &http.Client{Timeout: 8 * time.Second}}
}

type leg struct {
	Steps []struct {
		Geometry struct {
			Coordinates [][2]float64 `json:"coordinates"`
		} `json:"geometry"`
	} `json:"steps"`
}

func trechos(legs []leg, destinos []P) [][]P {
	out := make([][]P, len(legs))
	for i, l := range legs {
		var pts []P
		for _, s := range l.Steps {
			for _, c := range s.Geometry.Coordinates {
				p := P{Lat: c[1], Lng: c[0]}
				if n := len(pts); n == 0 || pts[n-1] != p {
					pts = append(pts, p)
				}
			}
		}
		out[i] = append(pts, destinos[i]) // termina exatamente no portão
	}
	return out
}

func (c *Cliente) chamar(ctx context.Context, servico string, pts []P, extra string, dest any) error {
	cs := make([]string, len(pts))
	for i, p := range pts {
		cs[i] = fmt.Sprintf("%.6f,%.6f", p.Lng, p.Lat)
	}
	url := fmt.Sprintf("%s/%s/v1/driving/%s?overview=false&steps=true&geometries=geojson%s", c.base, servico, strings.Join(cs, ";"), extra)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	req.Header.Set("User-Agent", "vanaaki-api/1.0")
	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return fmt.Errorf("osrm %d", res.StatusCode)
	}
	return json.NewDecoder(res.Body).Decode(dest)
}

// Tracar devolve o caminho pelas ruas de cada perna (pts[i] → pts[i+1]). Sem resposta: linha reta, real=false.
func (c *Cliente) Tracar(ctx context.Context, pts []P) (out [][]P, real bool) {
	reta := func() [][]P {
		l := make([][]P, 0, len(pts))
		for i := 1; i < len(pts); i++ {
			l = append(l, []P{pts[i-1], pts[i]})
		}
		return l
	}
	if len(pts) < 2 {
		return [][]P{}, false
	}
	var j struct {
		Routes []struct {
			Legs []leg `json:"legs"`
		} `json:"routes"`
	}
	if err := c.chamar(ctx, "route", pts, "", &j); err != nil || len(j.Routes) == 0 || len(j.Routes[0].Legs) != len(pts)-1 {
		return reta(), false
	}
	return trechos(j.Routes[0].Legs, pts[1:]), true
}

// Otimizar ordena as paradas pelas ruas (respeita mão única), com início e fim fixos. nil = sem resposta.
func (c *Cliente) Otimizar(ctx context.Context, inicio P, paradas []P, fim P) []int {
	if len(paradas) < 2 {
		return nil
	}
	pts := append(append([]P{inicio}, paradas...), fim)
	var j struct {
		Waypoints []struct {
			WaypointIndex int `json:"waypoint_index"`
		} `json:"waypoints"`
		Trips []struct {
			Legs []leg `json:"legs"`
		} `json:"trips"`
	}
	if err := c.chamar(ctx, "trip", pts, "&source=first&destination=last&roundtrip=false", &j); err != nil ||
		len(j.Waypoints) != len(pts) || len(j.Trips) == 0 {
		return nil
	}
	idx := make([]int, len(pts))
	for i := range idx {
		idx[i] = i
	}
	sort.Slice(idx, func(a, b int) bool { return j.Waypoints[idx[a]].WaypointIndex < j.Waypoints[idx[b]].WaypointIndex })
	ordem := make([]int, 0, len(paradas))
	for _, i := range idx[1 : len(idx)-1] {
		ordem = append(ordem, i-1)
	}
	return ordem
}
