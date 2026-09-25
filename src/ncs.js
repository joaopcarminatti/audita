'use strict';

const path = require('path');
const { DADOS, lerJson, gravarJson } = require('./caminhos');
const comunicacao = require('./comunicacao');

const BASE = path.join(DADOS, 'nao-conformidades.json');
const ABERTOS = ['Aberta', 'Em correção'];

const lerBase = () => lerJson(BASE, { sequencia: 0, ncs: [] });
const gravarBase = (base) => gravarJson(BASE, base);

function addDias(dataIso, dias) {
  const d = new Date(dataIso);
  d.setDate(d.getDate() + dias);
  return d.toISOString();
}

function diasEntre(a, b) {
  return Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));
}

/**
 * O histórico usa a mesma referência de tempo da operação que o gerou.
 * Com --simular-dias, a linha do tempo da NC permanece coerente.
 */
function registrar(nc, evento, detalhe, autor = 'Auditoria automatizada', quando = new Date().toISOString()) {
  nc.historico.push({ em: quando, evento, detalhe, autor });
}

/**
 * Confronta o resultado da auditoria com a base de NCs:
 * abre as novas, mantém as pendentes e encerra as que foram corrigidas.
 */
async function sincronizar(auditoria, config, agora = new Date().toISOString()) {
  const base = lerBase();
  const abertas = [];
  const encerradas = [];
  const mantidas = [];

  const naoConformes = new Map(
    auditoria.naoConformidades.map((n) => [`${n.artefato}|${n.itemId}`, n])
  );

  // 1. Encerramento: NC pendente cujo item passou a estar conforme na reauditoria.
  for (const nc of base.ncs.filter((n) => ABERTOS.includes(n.status))) {
    if (naoConformes.has(nc.chave)) {
      mantidas.push(nc);
      continue;
    }
    const artefato = auditoria.artefatos.find((a) => a.artefato === nc.artefato);
    const verificacao = artefato && artefato.verificacoes.find((v) => v.itemId === nc.itemId);
    if (!verificacao) {
      // Artefato saiu do escopo ou item saiu do checklist: a NC não pode ser dada
      // como resolvida sem evidência, então permanece pendente e fica sinalizada.
      if (!nc.semEvidencia) {
        nc.semEvidencia = true;
        registrar(nc, 'Sem evidência', 'Artefato ou item do checklist não encontrado nesta execução; NC mantida pendente.', 'Auditoria automatizada', agora);
      }
      continue;
    }

    nc.status = 'Resolvida';
    nc.resolvidaEm = agora;
    nc.evidenciaCorrecao = verificacao.evidencia;
    registrar(nc, 'Resolvida', `Correção identificada na reauditoria: ${verificacao.evidencia}`, 'Auditoria automatizada', agora);

    nc.status = 'Fechada';
    nc.fechadaEm = agora;
    nc.diasAteResolucao = diasEntre(nc.abertaEm, agora);
    registrar(nc, 'Verificada e fechada', 'Verificação automática do item do checklist: conforme.', 'Auditoria automatizada', agora);
    encerradas.push(nc);
  }

  // 2. Abertura: item não-conforme sem NC pendente.
  for (const [chave, achado] of naoConformes) {
    const pendente = base.ncs.find((n) => n.chave === chave && ABERTOS.includes(n.status));
    if (pendente) {
      pendente.evidencia = achado.evidencia;
      pendente.reauditadaEm = agora;
      pendente.reauditorias = (pendente.reauditorias || 0) + 1;
      registrar(pendente, 'Reauditoria', 'Item permanece não-conforme.', 'Auditoria automatizada', agora);
      continue;
    }

    const anteriores = base.ncs.filter((n) => n.chave === chave);
    const reincidencia = anteriores.length > 0;
    base.sequencia += 1;

    const nc = {
      id: `NC-${String(base.sequencia).padStart(4, '0')}`,
      chave,
      artefato: achado.artefato,
      itemId: achado.itemId,
      categoria: achado.categoria,
      descricaoItem: achado.descricao,
      checklist: auditoria.checklist.id,
      severidade: achado.severidade,
      evidencia: achado.evidencia,
      acaoCorretiva: achado.acaoCorretiva,
      responsavel: achado.responsavel || config.responsavelPadrao,
      status: 'Aberta',
      abertaEm: agora,
      prazoOriginal: addDias(agora, config.slaDias[achado.severidade]),
      prazo: addDias(agora, config.slaDias[achado.severidade]),
      nivelEscalonamento: reincidencia ? 2 : 1,
      reincidencias: anteriores.length,
      reauditorias: 0,
      historico: [],
    };

    registrar(nc, 'Aberta', `Não-conformidade detectada. Evidência: ${achado.evidencia}`, 'Auditoria automatizada', agora);
    if (reincidencia) {
      registrar(
        nc,
        'Escalonada por reincidência',
        `${anteriores.length}ª reincidência do item ${nc.itemId} neste artefato: abertura direta no nível 2.`,
        'Auditoria automatizada',
        agora
      );
    }
    base.ncs.push(nc);
    abertas.push(nc);
  }

  gravarBase(base);

  for (const nc of abertas) await comunicacao.comunicarAbertura(config, nc, agora);
  for (const nc of encerradas) await comunicacao.comunicarEncerramento(config, nc, agora);

  return { abertas, encerradas, mantidas, total: base.ncs.length };
}

/**
 * Escalonamento: toda NC pendente com prazo vencido sobe um nível
 * e recebe novo prazo, até o nível máximo da matriz.
 */
async function verificarPrazos(config, agora = new Date().toISOString()) {
  const base = lerBase();
  const escalonadas = [];
  const nivelMaximo = Math.max(...config.escalonamento.map((n) => n.nivel));

  for (const nc of base.ncs.filter((n) => ABERTOS.includes(n.status))) {
    if (new Date(agora) <= new Date(nc.prazo)) continue;

    const nivelAnterior = nc.nivelEscalonamento;
    if (nivelAnterior >= nivelMaximo) {
      if (!nc.historico.some((h) => h.evento === 'Nível máximo atingido')) {
        registrar(nc, 'Nível máximo atingido', 'NC permanece no comitê da qualidade até a resolução.', 'Auditoria automatizada', agora);
      }
      continue;
    }

    nc.nivelEscalonamento = nivelAnterior + 1;
    nc.prazo = addDias(agora, config.slaDias[nc.severidade]);
    nc.escalonadaEm = agora;
    const nivel = config.escalonamento.find((n) => n.nivel === nc.nivelEscalonamento);
    registrar(nc, `Escalonada para N${nc.nivelEscalonamento}`, `Prazo vencido. Instância acionada: ${nivel.papel}.`, 'Auditoria automatizada', agora);
    escalonadas.push({ nc, nivelAnterior });
  }

  gravarBase(base);
  for (const { nc, nivelAnterior } of escalonadas) {
    await comunicacao.comunicarEscalonamento(config, nc, nivelAnterior, agora);
  }
  return escalonadas.map((e) => e.nc);
}

function assumir(id, responsavel, quando = new Date().toISOString()) {
  const base = lerBase();
  const nc = base.ncs.find((n) => n.id === id);
  if (!nc) throw new Error(`NC ${id} não encontrada`);
  if (!ABERTOS.includes(nc.status)) throw new Error(`NC ${id} já está ${nc.status.toLowerCase()}`);
  nc.status = 'Em correção';
  if (responsavel) nc.responsavel = responsavel;
  registrar(nc, 'Em correção', `${nc.responsavel} assumiu a correção.`, nc.responsavel, quando);
  gravarBase(base);
  return nc;
}

function comentar(id, texto, autor, quando = new Date().toISOString()) {
  const base = lerBase();
  const nc = base.ncs.find((n) => n.id === id);
  if (!nc) throw new Error(`NC ${id} não encontrada`);
  if (!texto || !texto.trim()) throw new Error('Informe o texto do comentário.');
  registrar(nc, 'Comentário', texto.trim(), autor || nc.responsavel, quando);
  gravarBase(base);
  return nc;
}

function listar(filtro = {}) {
  const base = lerBase();
  let ncs = base.ncs;
  if (filtro.status) ncs = ncs.filter((n) => n.status === filtro.status);
  if (filtro.pendentes) ncs = ncs.filter((n) => ABERTOS.includes(n.status));
  if (filtro.artefato) ncs = ncs.filter((n) => n.artefato === filtro.artefato);
  if (filtro.severidade) ncs = ncs.filter((n) => n.severidade === filtro.severidade);
  const ordem = { 'Crítica': 0, 'Alta': 1, 'Média': 2, 'Baixa': 3 };
  return [...ncs].sort((a, b) => ordem[a.severidade] - ordem[b.severidade] || a.id.localeCompare(b.id));
}

function indicadores(agora = new Date().toISOString()) {
  const ncs = lerBase().ncs;
  const pendentes = ncs.filter((n) => ABERTOS.includes(n.status));
  const fechadas = ncs.filter((n) => n.status === 'Fechada');
  return {
    total: ncs.length,
    pendentes: pendentes.length,
    fechadas: fechadas.length,
    vencidas: pendentes.filter((n) => new Date(agora) > new Date(n.prazo)).length,
    escalonadas: pendentes.filter((n) => n.nivelEscalonamento > 1).length,
    reincidentes: ncs.filter((n) => n.reincidencias > 0).length,
    tempoMedioResolucao: fechadas.length
      ? Number((fechadas.reduce((s, n) => s + (n.diasAteResolucao || 0), 0) / fechadas.length).toFixed(1))
      : null,
  };
}

function resetar() {
  gravarBase({ sequencia: 0, ncs: [] });
  comunicacao.limparLog();
}

module.exports = {
  sincronizar, verificarPrazos, assumir, comentar, listar, indicadores,
  lerBase, resetar, addDias, diasEntre, ABERTOS,
};
