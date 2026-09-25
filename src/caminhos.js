'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Caminhos usados pela ferramenta. As variáveis de ambiente permitem
 * apontar para outra pasta — é o que os testes automatizados usam para
 * rodar sem tocar na base real de não-conformidades.
 */
const RAIZ = path.resolve(__dirname, '..');
const DADOS = process.env.AUDITA_DADOS || path.join(RAIZ, 'dados');
const COMUNICACOES = process.env.AUDITA_COMUNICACOES || path.join(RAIZ, 'comunicacoes');
const RELATORIOS = process.env.AUDITA_RELATORIOS || path.join(RAIZ, 'relatorios');

/** Leitura tolerante: arquivo inexistente devolve o padrão; arquivo corrompido avisa onde está o erro. */
function lerJson(arquivo, padrao) {
  if (!fs.existsSync(arquivo)) return padrao;
  const bruto = fs.readFileSync(arquivo, 'utf8').trim();
  if (!bruto) return padrao;
  try {
    return JSON.parse(bruto);
  } catch (erro) {
    throw new Error(
      `O arquivo ${path.relative(RAIZ, arquivo)} está corrompido (${erro.message}). ` +
        'Corrija o JSON ou rode "node audita.js resetar --confirmar" para recomeçar a base.'
    );
  }
}

function gravarJson(arquivo, conteudo) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, JSON.stringify(conteudo, null, 2));
}

module.exports = { RAIZ, DADOS, COMUNICACOES, RELATORIOS, lerJson, gravarJson };
