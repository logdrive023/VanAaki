import { db } from './db';
import type { Aluno, EventoPontos, Recompensa, Turno, Van } from './types';
import { tipoEvento } from '../lib/gamificacao';
import { addDias, agoraIso, CORES, hoje, mesAtual, uid } from '../lib/util';
import { novaCobranca } from '../services/acoes';

/** Perfis usados quando alguém entra pela landing page (dados fictícios para teste). */
export const VAN_PRINCIPAL = 'van-carlos';
export const ESCOLA_PRINCIPAL = 'esc-santa-maria';
export const ALUNO_PADRAO = 'al-lucas';
const VERSAO_SEED = 5;

/** Gerador pseudoaleatório com semente (o histórico de exemplo sai sempre igual). */
function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const SM = ESCOLA_PRINCIPAL, HZ = 'esc-horizonte', RL = 'esc-roberto';
const ALUNOS: [string, string, string, string, string, string, number, number, number, string, Turno][] = [
  // id, nome, apelido, série, responsável, endereço, lat, lng, mensalidade, escola, turno
  // manhã: Santa Maria (entra 07:15) e Horizonte (entra 07:30) na MESMA rota
  ['al-ana', 'Ana Souza', 'Aninha', '3º ano', 'Juliana Souza', 'Rua Joaquim Távora, 410', -23.5958, -46.6318, 42000, SM, 'manha'],
  ['al-pedro', 'Pedro Lima', 'Pedrão', '5º ano', 'Rodrigo Lima', 'Rua Sena Madureira, 455', -23.5946, -46.6243, 42000, SM, 'manha'],
  [ALUNO_PADRAO, 'Lucas Andrade', 'Luquinhas', '4º ano', 'Rafael Andrade', 'Rua Áurea, 88', -23.5922, -46.6289, 42000, SM, 'manha'],
  ['al-bia', 'Beatriz Faria', 'Bia', '1º EM', 'Carla Faria', 'Rua Machado de Assis, 230', -23.5903, -46.6232, 45000, SM, 'manha'],
  ['al-gabriel', 'Gabriel Rocha', 'Gabi', '2º ano', 'Patrícia Rocha', 'Rua Coronel Lisboa, 150', -23.5979, -46.6352, 42000, SM, 'manha'],
  ['al-maria', 'Maria Clara Nunes', 'Clarinha', '6º ano', 'André Nunes', 'Rua Humberto I, 702', -23.5895, -46.6304, 42000, SM, 'manha'],
  ['al-enzo', 'Enzo Martins', 'Enzão', '5º ano', 'Fernanda Martins', 'Rua Pelotas, 95', -23.5934, -46.6374, 42000, HZ, 'manha'],
  ['al-sofia', 'Sofia Ribeiro', 'Sofi', '4º ano', 'Marcos Ribeiro', 'Rua Rio Grande, 310', -23.5880, -46.6262, 42000, HZ, 'manha'],
  // tarde: Roberto Lima (sai 17:40) e Santa Maria (sai 18:00)
  ['al-davi', 'Davi Costa', 'Davizão', '3º ano', 'Renata Costa', 'Rua Tangará, 120', -23.5913, -46.6214, 42000, SM, 'tarde'],
  ['al-helena', 'Helena Prado', 'Lena', '2º ano', 'Bruno Prado', 'Rua Dona Inácia Uchoa, 300', -23.5970, -46.6271, 42000, SM, 'tarde'],
  ['al-theo', 'Theo Almeida', 'Theozinho', '7º ano', 'Camila Almeida', 'Rua Morgado de Mateus, 410', -23.5941, -46.6409, 39000, RL, 'tarde'],
  ['al-alice', 'Alice Moura', 'Lili', '8º ano', 'Diego Moura', 'Rua Embaú, 220', -23.5993, -46.6331, 39000, RL, 'tarde'],
  // noite: ensino médio noturno no Horizonte (entra 19:00, sai 22:30)
  ['al-joao', 'João Pedro Silva', 'JP', '2º EM noturno', 'Sandra Silva', 'Rua França Pinto, 510', -23.5900, -46.6381, 38000, HZ, 'noite'],
  ['al-larissa', 'Larissa Reis', 'Lari', '3º EM noturno', 'Paulo Reis', 'Rua Afonso Celso, 640', -23.5956, -46.6236, 38000, HZ, 'noite'],
];

export async function garantirDados() {
  const c = await db.config.get('seed');
  if (c?.valor === VERSAO_SEED) return;
  await restaurarExemplo();
}

/** Apaga tudo e recria os dados de exemplo. */
export async function restaurarExemplo() {
  await db.transaction('rw', db.todas, async () => {
    for (const t of db.todas) await t.clear();
    const data = hoje(), mes = mesAtual();

    await db.escolas.bulkAdd([
      { id: SM, nome: 'Colégio Santa Maria', endereco: 'Rua Domingos de Morais, 1.200 · Vila Mariana', local: { lat: -23.5861, lng: -46.6338 },
        horarios: { manha: { entrada: '07:15', saida: '12:20' }, tarde: { entrada: '13:15', saida: '18:00' } }, confirmaEntrada: true },
      { id: HZ, nome: 'Colégio Horizonte', endereco: 'Rua Vergueiro, 3.100 · Vila Mariana', local: { lat: -23.5822, lng: -46.6403 },
        horarios: { manha: { entrada: '07:30', saida: '12:40' }, noite: { entrada: '19:00', saida: '22:30' } } },
      { id: RL, nome: 'EE Prof. Roberto Lima', endereco: 'Rua Loefgren, 800 · Vila Clementino', local: { lat: -23.5968, lng: -46.6431 },
        horarios: { manha: { entrada: '07:00', saida: '12:00' }, tarde: { entrada: '13:00', saida: '17:40' } } },
    ]);

    const vans: Van[] = [
      { id: VAN_PRINCIPAL, nome: 'Tio Carlos Transportes', motorista: 'Tio Carlos', telefone: '11 90000-0001', placa: 'FXK-2B19', modelo: 'Sprinter branca', garagem: { lat: -23.6003, lng: -46.6263 }, escolaIds: [SM, HZ, RL], credenciamento: { [SM]: 'credenciada', [HZ]: 'credenciada', [RL]: 'credenciada' },
        turnos: [{ turno: 'manha', ativo: true, escolaIds: [SM, HZ] }, { turno: 'tarde', ativo: true, escolaIds: [SM, RL] }, { turno: 'noite', ativo: true, escolaIds: [HZ] }],
        precoPadrao: 42000, vagas: 12, avaliacao: 4.9 },
      { id: 'van-sandra', nome: 'Tia Sandra Escolar', motorista: 'Tia Sandra', telefone: '11 90000-0002', placa: 'GHT-4C21', modelo: 'Master prata', garagem: { lat: -23.5800, lng: -46.6300 }, escolaIds: [SM, RL], credenciamento: { [SM]: 'credenciada', [RL]: 'credenciada' },
        turnos: [{ turno: 'manha', ativo: true, escolaIds: [SM, RL] }, { turno: 'tarde', ativo: true, escolaIds: [SM] }, { turno: 'noite', ativo: false, escolaIds: [] }], precoPadrao: 48000, vagas: 1, avaliacao: 5 },
      { id: 'van-coop', nome: 'Coopervan Zona Sul', motorista: 'Cooperativa', telefone: '11 90000-0003', placa: 'BRA-7E55', modelo: '14 vans', garagem: { lat: -23.6100, lng: -46.6400 }, escolaIds: [SM, HZ, RL], credenciamento: { [SM]: 'pendente', [HZ]: 'credenciada', [RL]: 'credenciada' },
        turnos: [{ turno: 'manha', ativo: true, escolaIds: [SM, HZ, RL] }, { turno: 'tarde', ativo: true, escolaIds: [SM, HZ, RL] }, { turno: 'noite', ativo: true, escolaIds: [HZ] }], precoPadrao: 39000, vagas: 8, avaliacao: 4.7 },
    ];
    await db.vans.bulkAdd(vans);

    const alunos: Aluno[] = ALUNOS.map(([id, nome, apelido, serie, resp, end, lat, lng, mens, escolaId, turno], i) => ({
      id, vanId: VAN_PRINCIPAL, escolaId, nome, apelido, cor: CORES[i % CORES.length], serie, turno,
      responsavel: resp, telefoneResp: `11 9${String(1000 + i * 37).padStart(4, '0')}-${String(2000 + i * 53).padStart(4, '0')}`,
      endereco: end, local: { lat, lng }, mensalidade: mens, diaVencimento: id === 'al-gabriel' ? 28 : 10, ativo: true, criadoEm: agoraIso(),
    }));
    await db.alunos.bulkAdd(alunos);

    // pagamentos: mês passado todos pagos; este mês 2 pendentes (1 atrasado)
    const [y, m] = mes.split('-').map(Number);
    const mesPassado = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    for (const a of alunos) {
      await db.pagamentos.add({ ...novaCobranca(a, mesPassado), status: 'pago', pagoEm: `${mesPassado}-08T10:00:00.000Z`, metodo: 'pix' });
      const pend = a.id === 'al-bia' || a.id === 'al-gabriel';
      await db.pagamentos.add({ ...novaCobranca(a, mes), ...(pend ? {} : { status: 'pago' as const, pagoEm: `${mes}-05T10:00:00.000Z`, metodo: 'pix' as const }) });
    }

    // avisos do dia: Gabriel não vai; a mãe da Ana leva de manhã (o tio só traz); a mãe do Davi busca na escola
    await db.presencas.bulkAdd([
      { id: `al-gabriel|${data}`, alunoId: 'al-gabriel', data, ida: false, volta: false, motivo: 'Está com febre', avisadoEm: agoraIso() },
      { id: `al-ana|${data}`, alunoId: 'al-ana', data, ida: false, volta: true, motivo: 'Consulta no dentista cedo', avisadoEm: agoraIso() },
      { id: `al-davi|${data}`, alunoId: 'al-davi', data, ida: true, volta: false, motivo: 'Vou buscar para o futebol', avisadoEm: agoraIso() },
    ]);

    // histórico de pontos (últimas 4 semanas úteis)
    const r = rng(42);
    const ev: EventoPontos[] = [];
    const add = (alunoId: string, d: string, tipo: string, observacao?: string) => {
      const t = tipoEvento(tipo)!;
      ev.push({ id: uid(), alunoId, vanId: VAN_PRINCIPAL, data: d, criadoEm: `${d}T10:${String(ev.length % 60).padStart(2, '0')}:00.000Z`, tipo, pontos: t.pontos, descricao: t.nome, observacao, autor: t.grupo === 'auto' ? 'sistema' : 'motorista' });
    };
    const perfil: Record<string, number> = { 'al-ana': 0.8, 'al-pedro': 0.6, [ALUNO_PADRAO]: 0.75, 'al-bia': 0.5, 'al-gabriel': 0.65, 'al-maria': 0.85, 'al-enzo': 0.4, 'al-sofia': 0.9 };
    for (let k = 28; k >= 1; k--) {
      const d = addDias(data, -k);
      const dow = new Date(d + 'T12:00').getDay();
      if (dow === 0 || dow === 6) continue;
      for (const a of alunos) {
        const x = r();
        if (x < 0.04) add(a.id, d, 'ausente_sem_aviso');
        else if (x < 0.08) add(a.id, d, 'aviso_ausencia');
        else add(a.id, d, r() < (perfil[a.id] ?? 0.7) ? 'pronto_portao' : 'embarque');
        if (r() < 0.12) add(a.id, d, 'cinto');
        if (r() < 0.06) add(a.id, d, 'educado');
        if (r() < 0.03) add(a.id, d, 'ajudou');
      }
    }
    add('al-enzo', addDias(data, -6), 'bagunca', 'Gritando com os colegas no trânsito');
    add('al-enzo', addDias(data, -2), 'bagunca');
    add('al-pedro', addDias(data, -4), 'sem_cinto', 'Tirou o cinto duas vezes');
    add(ALUNO_PADRAO, addDias(data, -3), 'ajudou', 'Ajudou a Aninha com a mochila');
    add('al-sofia', addDias(data, -7), 'semana_perfeita');
    await db.pontos.bulkAdd(ev);

    const recompensas: Recompensa[] = [
      ['🎵', 'Escolher a música da viagem', 40], ['🪟', 'Sentar na janela por 1 semana', 30],
      ['🧑‍✈️', 'Ajudante do tio por um dia', 80], ['🍭', 'Pirulito surpresa', 25], ['🏅', 'Medalha de destaque do mês', 150],
    ].map(([icone, nome, custo], i) => ({ id: `rec-${i}`, vanId: VAN_PRINCIPAL, icone: icone as string, nome: nome as string, custo: custo as number, ativo: true }));
    await db.recompensas.bulkAdd(recompensas);
    await db.resgates.add({ id: uid(), alunoId: 'al-pedro', recompensaId: 'rec-1', nome: recompensas[1].nome, icone: '🪟', custo: 30, status: 'pendente', criadoEm: agoraIso() });

    await db.mensagens.bulkAdd([
      { id: uid(), alunoId: ALUNO_PADRAO, de: 'pais', texto: 'Bom dia, tio! Sexta o Lucas sai 11h por causa da feira de ciências.', criadoEm: `${addDias(data, -1)}T09:12:00.000Z`, lida: true },
      { id: uid(), alunoId: ALUNO_PADRAO, de: 'motorista', texto: 'Combinado! Passo na escola às 11h10.', criadoEm: `${addDias(data, -1)}T09:30:00.000Z`, lida: true },
      { id: uid(), alunoId: 'al-maria', de: 'pais', texto: 'Amanhã a Clara vai dormir na avó, pode buscar na Rua Vergueiro, 2.000?', criadoEm: agoraIso(), lida: false },
    ]);

    await db.notificacoes.bulkAdd([
      { id: uid(), para: 'motorista', vanId: VAN_PRINCIPAL, icone: '🙋', titulo: 'Gabriel não vai hoje', texto: 'Motivo: Está com febre', criadoEm: agoraIso(), lida: false },
      { id: uid(), para: 'motorista', vanId: VAN_PRINCIPAL, icone: '🎁', titulo: 'Pedido de prêmio', texto: 'Pedro quer "Sentar na janela por 1 semana" (30 ⭐)', criadoEm: agoraIso(), lida: false },
      { id: uid(), para: 'pais', alunoId: ALUNO_PADRAO, icone: '🤝', titulo: 'Elogio do tio: Ajudou um colega', texto: 'Lucas ganhou +10 pontos · "Ajudou a Aninha com a mochila"', criadoEm: `${addDias(data, -3)}T11:00:00.000Z`, lida: true },
      { id: uid(), para: 'escola', escolaId: ESCOLA_PRINCIPAL, icone: '📝', titulo: 'Credenciamento pendente', texto: 'Coopervan Zona Sul pediu credenciamento', criadoEm: agoraIso(), lida: false },
    ]);

    await db.config.put({ id: 'seed', valor: VERSAO_SEED });
  });
}

/** Exporta todas as tabelas em JSON (backup local, mesma ideia do dia-dia). */
export async function exportarBackup() {
  const dados: Record<string, unknown[]> = {};
  for (const t of db.todas) dados[t.name] = await t.toArray();
  const blob = new Blob([JSON.stringify({ formato: 'VANAAKI_BACKUP', versao: 1, exportadoEm: agoraIso(), dados }, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `vanaaki-backup-${hoje()}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
