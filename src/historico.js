'use strict';

const path = require('path');
const { DADOS, lerJson, gravarJson } = require('./caminhos');

const ARQUIVO = path.join(DADOS, 'historico-auditorias.json');
const LIMITE = 50;

const listar = () => lerJson(ARQUIVO, []);

/** Uma linha por execução: é o que permite mostrar se a qualidade está melhorando. */
function registrar(auditoria, { abertas = 0, encerradas = 0, escalonadas = 0, pendentes = 0 }, quando = new Date().toISOString()) {
  const historico = listar();
  const anterior = historico[historico.length - 1];

  const entrada = {
    em: quando,
    aderencia: auditoria.resumo.aderencia,
    resultado: auditoria.resumo.resultado,
    meta: auditoria.resumo.meta,
    variacao: anterior ? Number((auditoria.resumo.aderencia - anterior.aderencia).toFixed(1)) : null,
    ncsAbertas: abertas,
    ncsEncerradas: encerradas,
    ncsEscalonadas: escalonadas,
    ncsPendentes: pendentes,
    porArtefato: Object.fromEntries(auditoria.artefatos.map((a) => [a.artefato, a.percentual])),
  };

  historico.push(entrada);
  gravarJson(ARQUIVO, historico.slice(-LIMITE));
  return entrada;
}

function limpar() {
  gravarJson(ARQUIVO, []);
}

module.exports = { registrar, listar, limpar };
