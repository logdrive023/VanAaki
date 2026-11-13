// Package geo: distâncias, previsão de chegada e otimização da ordem das paradas
// (mesmas contas do app, para o servidor e a tela concordarem).
package geo

import (
	"math"

	"github.com/logdrive023/vanaaki/backend/internal/models"
)

type P = models.LatLng

const (
	FatorRua     = 1.3  // rua não é linha reta
	VelMediaKmh  = 28.0 // van escolar na cidade
	MinPorParada = 1.0
)

// DistM = distância em metros (haversine).
func DistM(a, b P) float64 {
	const R, rad = 6371000.0, math.Pi / 180
	dLat, dLng := (b.Lat-a.Lat)*rad, (b.Lng-a.Lng)*rad
	h := math.Pow(math.Sin(dLat/2), 2) + math.Cos(a.Lat*rad)*math.Cos(b.Lat*rad)*math.Pow(math.Sin(dLng/2), 2)
	return 2 * R * math.Asin(math.Sqrt(h))
}

// CompCaminho = comprimento estimado por rua (linha reta × fator).
func CompCaminho(pts []P) float64 {
	t := 0.0
	for i := 1; i < len(pts); i++ {
		t += DistM(pts[i-1], pts[i]) * FatorRua
	}
	return t
}

// CompReal = comprimento de um caminho que já segue as ruas.
func CompReal(pts []P) float64 {
	t := 0.0
	for i := 1; i < len(pts); i++ {
		t += DistM(pts[i-1], pts[i])
	}
	return t
}

// EtaMin = minutos para percorrer o caminho com `paradas` paradas no meio.
func EtaMin(pts []P, paradas int, pelasRuas bool) int {
	return EtaMinVel(pts, paradas, pelasRuas, 0)
}

// EtaMinVel = EtaMin com a velocidade MEDIDA da van hoje (km/h, já contando paradas e trânsito).
// velKmh <= 0 usa a média padrão de van escolar na cidade.
func EtaMinVel(pts []P, paradas int, pelasRuas bool, velKmh float64) int {
	m := CompCaminho(pts)
	if pelasRuas {
		m = CompReal(pts)
	}
	vel, porParada := VelMediaKmh, MinPorParada
	if velKmh > 0 {
		// a média medida já inclui o tempo parado: conta só meio minuto extra por parada
		vel, porParada = math.Max(8, math.Min(60, velKmh)), MinPorParada/2
	}
	v := int(math.Round(m/1000/vel*60 + float64(paradas)*porParada))
	if v < 1 {
		return 1
	}
	return v
}

func andar(de, para P, metros float64) (P, bool) {
	d := DistM(de, para)
	if d <= metros || d < 1 {
		return para, true
	}
	f := metros / d
	return P{Lat: de.Lat + (para.Lat-de.Lat)*f, Lng: de.Lng + (para.Lng-de.Lng)*f}, false
}

// Seguir anda `metros` pelo caminho. Devolve a posição, o que falta e se chegou ao fim.
func Seguir(pos P, caminho []P, metros float64) (P, []P, bool) {
	atual, resto, falta := pos, append([]P(nil), caminho...), metros
	for len(resto) > 0 {
		d := DistM(atual, resto[0])
		if d > falta {
			np, _ := andar(atual, resto[0], falta)
			return np, resto, false
		}
		falta -= d
		atual, resto = resto[0], resto[1:]
	}
	return atual, []P{}, true
}

// Aparar corta do caminho o que ficou para trás da posição real (GPS do celular).
func Aparar(pos P, caminho []P) []P {
	if len(caminho) == 0 {
		return caminho
	}
	melhor, md := 0, math.Inf(1)
	limite := len(caminho)
	if limite > 400 {
		limite = 400
	}
	for i := 0; i < limite; i++ {
		if d := DistM(pos, caminho[i]); d < md {
			md, melhor = d, i
		}
	}
	return append([]P(nil), caminho[melhor:]...)
}

// OtimizarOrdem: vizinho mais próximo + 2-opt com início e fim fixos. Devolve os índices.
func OtimizarOrdem(inicio P, paradas []P, fim P) []int {
	n := len(paradas)
	ordem := make([]int, 0, n)
	if n <= 1 {
		for i := range paradas {
			ordem = append(ordem, i)
		}
		return ordem
	}
	usado := make([]bool, n)
	atual := inicio
	for len(ordem) < n {
		melhor, md := -1, math.Inf(1)
		for i, p := range paradas {
			if !usado[i] {
				if d := DistM(atual, p); d < md {
					md, melhor = d, i
				}
			}
		}
		usado[melhor] = true
		ordem = append(ordem, melhor)
		atual = paradas[melhor]
	}
	pt := func(k int) P {
		if k < 0 {
			return inicio
		}
		if k >= n {
			return fim
		}
		return paradas[ordem[k]]
	}
	for guarda, melhorou := 0, true; melhorou && guarda < 200; guarda++ {
		melhorou = false
		for i := 0; i < n-1; i++ {
			for j := i + 1; j < n; j++ {
				antes := DistM(pt(i-1), pt(i)) + DistM(pt(j), pt(j+1))
				depois := DistM(pt(i-1), pt(j)) + DistM(pt(i), pt(j+1))
				if depois+0.5 < antes {
					for a, b := i, j; a < b; a, b = a+1, b-1 {
						ordem[a], ordem[b] = ordem[b], ordem[a]
					}
					melhorou = true
				}
			}
		}
	}
	return ordem
}
