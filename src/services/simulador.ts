import { passoSimulacao } from './viagem';

const INTERVALO_MS = 400;
let iniciado = false;

/**
 * "GPS de mentira": move a van das viagens em andamento.
 * Com várias abas abertas (motorista, pais, aluno, escola), só UMA roda a simulação —
 * o Web Locks garante isso; se a aba fechar, outra assume sozinha.
 */
export function iniciarSimulador() {
  if (iniciado) return;
  iniciado = true;
  const loop = async () => {
    let ultimo = performance.now();
    for (;;) {
      await new Promise((r) => setTimeout(r, INTERVALO_MS));
      const agora = performance.now();
      try { await passoSimulacao(Math.min(agora - ultimo, 15000)); } catch (e) { console.warn('simulação', e); }
      ultimo = agora; // usa o tempo real passado: aba em segundo plano (timer lento) não atrasa a van
    }
  };
  if (navigator.locks?.request) navigator.locks.request('vanaaki-simulador', () => loop());
  else void loop();
}
