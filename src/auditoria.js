'use strict';

const fs = require('fs');
const path = require('path');
const { RAIZ, lerJson } = require('./caminhos');
const { parseArtefato } = require('./parser');
const { regras } = require('./regras');

function carregarConfig() {
  const arquivo = path.join(RAIZ, 'config.json');
  if (!fs.existsSync(arquivo)) throw new Error('config.json não encontrado na raiz do projeto.');
  return lerJson(arquivo, null);
}

function carregarChecklist(config) {
  const arquivo = path.join(RAIZ, config.checklist);
  if (!fs.existsSync(arquivo)) throw new Error(`Checklist não encontrado: ${config.checklist}`);
  return lerJson(arquivo, null);
}

/**
 * Verificação da própria configuração antes de auditar: erro de cadastro no checklist
 * vira mensagem clara, e não um prazo "NaN" ou um item silenciosamente ignorado.
 */
function validarConfiguracao(checklist, config) {
  const problemas = [];
  const ids = new Set();

  if (!Array.isArray(checklist.itens) || checklist.itens.length === 0) {
    problemas.push('O checklist não possui itens.');
  }

  for (const item of checklist.itens || []) {
    if (ids.has(item.id)) problemas.push(`Item ${item.id} está duplicado no checklist.`);
    ids.add(item.id);
    if (!regras[item.regra]) problemas.push(`Item ${item.id}: regra "${item.regra}" não existe em src/regras.js.`);
    if (!(Number(item.peso) > 0)) problemas.push(`Item ${item.id}: peso deve ser um número maior que zero.`);
    if (!config.slaDias[item.severidade]) problemas.push(`Item ${item.id}: severidade "${item.severidade}" não tem SLA em config.json.`);
    if (!item.acaoCorretiva) problemas.push(`Item ${item.id}: falta a ação corretiva.`);
  }

  if (!Array.isArray(config.escalonamento) || config.escalonamento.length < 2) {
    problemas.push('config.json precisa de pelo menos dois níveis de escalonamento.');
  }

  if (problemas.length) throw new Error(`Configuração inválida:\n  - ${problemas.join('\n  - ')}`);
}

function classificar(checklist, percentual) {
  const faixa = checklist.classificacao.find((c) => percentual >= c.min);
  return faixa ? faixa.resultado : 'Reprovado';
}

/** Aderência = soma dos pesos conformes ÷ soma dos pesos aplicáveis × 100 */
function calcularAderencia(verificacoes) {
  const total = verificacoes.reduce((s, v) => s + v.peso, 0);
  const obtido = verificacoes.filter((v) => v.conforme).reduce((s, v) => s + v.peso, 0);
  return { total, obtido, percentual: total === 0 ? 0 : Number(((obtido / total) * 100).toFixed(1)) };
}

function agregarPorCategoria(verificacoes) {
  const mapa = {};
  for (const v of verificacoes) {
    mapa[v.categoria] = mapa[v.categoria] || { total: 0, obtido: 0, naoConformes: 0 };
    mapa[v.categoria].total += v.peso;
    if (v.conforme) mapa[v.categoria].obtido += v.peso;
    else mapa[v.categoria].naoConformes += 1;
  }
  return Object.entries(mapa).map(([categoria, d]) => ({
    categoria,
    ...d,
    percentual: Number(((d.obtido / d.total) * 100).toFixed(1)),
  }));
}

function auditarArtefato(artefato, checklist) {
  const verificacoes = checklist.itens.map((item) => {
    const resultado = regras[item.regra](artefato);
    return {
      itemId: item.id,
      categoria: item.categoria,
      descricao: item.descricao,
      peso: item.peso,
      severidade: item.severidade,
      acaoCorretiva: item.acaoCorretiva,
      conforme: resultado.conforme,
      evidencia: resultado.evidencia,
    };
  });

  const aderencia = calcularAderencia(verificacoes);

  return {
    artefato: artefato.id,
    arquivo: artefato.arquivo,
    titulo: artefato.tituloDescritivo,
    responsavel: artefato.campos['responsavel'] || '',
    ...aderencia,
    resultado: classificar(checklist, aderencia.percentual),
    porCategoria: agregarPorCategoria(verificacoes),
    verificacoes,
  };
}

function executarAuditoria() {
  const config = carregarConfig();
  const checklist = carregarChecklist(config);
  validarConfiguracao(checklist, config);

  const pasta = path.join(RAIZ, config.pastaArtefatos);
  if (!fs.existsSync(pasta)) throw new Error(`Pasta de artefatos não encontrada: ${config.pastaArtefatos}`);

  const arquivos = fs.readdirSync(pasta).filter((f) => f.toLowerCase().endsWith('.md')).sort();
  if (arquivos.length === 0) throw new Error(`Nenhum artefato .md encontrado em ${config.pastaArtefatos}/`);

  const artefatos = arquivos.map((arquivo) => {
    const conteudo = fs.readFileSync(path.join(pasta, arquivo), 'utf8');
    return auditarArtefato(parseArtefato(conteudo, arquivo), checklist);
  });

  const total = artefatos.reduce((s, a) => s + a.total, 0);
  const obtido = artefatos.reduce((s, a) => s + a.obtido, 0);
  const percentual = Number(((obtido / total) * 100).toFixed(1));

  const naoConformidades = artefatos.flatMap((a) =>
    a.verificacoes
      .filter((v) => !v.conforme)
      .map((v) => ({ artefato: a.artefato, responsavel: a.responsavel, ...v }))
  );

  const meta = Number(config.metaAderencia ?? 90);

  return {
    executadaEm: new Date().toISOString(),
    projeto: config.projeto,
    auditor: config.auditor,
    checklist: { id: checklist.id, nome: checklist.nome, versao: checklist.versao, artefato: checklist.artefato },
    resumo: {
      artefatosAuditados: artefatos.length,
      itensVerificados: artefatos.length * checklist.itens.length,
      pontosPossiveis: total,
      pontosObtidos: obtido,
      aderencia: percentual,
      resultado: classificar(checklist, percentual),
      meta,
      atingiuMeta: percentual >= meta,
      naoConformidades: naoConformidades.length,
      porSeveridade: ['Crítica', 'Alta', 'Média', 'Baixa'].reduce((acc, s) => {
        acc[s] = naoConformidades.filter((n) => n.severidade === s).length;
        return acc;
      }, {}),
    },
    porCategoria: agregarPorCategoria(artefatos.flatMap((a) => a.verificacoes)),
    artefatos,
    naoConformidades,
  };
}

module.exports = {
  executarAuditoria,
  auditarArtefato,
  carregarConfig,
  carregarChecklist,
  validarConfiguracao,
  classificar,
  calcularAderencia,
  agregarPorCategoria,
};
