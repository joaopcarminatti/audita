'use strict';

const { semAcento } = require('./parser');

/**
 * Cada regra recebe o artefato já interpretado e devolve:
 *   { conforme: boolean, evidencia: string }
 * A evidência é o que sustenta a NC no relatório de auditoria.
 */

const PAPEIS_GENERICOS = ['usuario', 'pessoa', 'cliente', 'ator', 'sistema', 'user'];

const TERMOS_AMBIGUOS = [
  'rapido', 'rapida', 'lento', 'amigavel', 'facil', 'intuitivo', 'simples',
  'eficiente', 'adequado', 'robusto', 'flexivel', 'varios', 'alguns', 'diversos',
  'etc', 'se possivel', 'melhor forma', 'o mais breve possivel', 'de forma clara',
];

const ESCALA_FIBONACCI = ['1', '2', '3', '5', '8', '13'];
const PRIORIDADES = ['alta', 'media', 'baixa'];

function contem(texto, termo) {
  const alvo = semAcento(texto).toLowerCase();
  const alvoTermo = semAcento(termo).toLowerCase();
  const regex = new RegExp(`(?<!\\p{L})${alvoTermo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\p{L})`, 'u');
  return regex.test(alvo);
}

const regras = {
  identificador(a) {
    const valor = a.campos['id'] || '';
    const conforme = /^HU-\d{3}$/.test(valor);
    return {
      conforme,
      evidencia: valor ? `Campo ID = "${valor}"` : 'Campo ID ausente no cabeçalho',
    };
  },

  titulo(a) {
    const t = a.tituloDescritivo || '';
    const conforme = t.length > 0 && t.length <= 80;
    return {
      conforme,
      evidencia: t ? `Título com ${t.length} caractere(s): "${t}"` : 'Título ausente',
    };
  },

  narrativa(a) {
    const linhas = a.narrativa.split('\n').map((l) => semAcento(l).toLowerCase().trim());
    const temComo = linhas.some((l) => /^como\s+\S+/.test(l));
    const temQuero = linhas.some((l) => /^quero\s+\S+/.test(l));
    const temPara = linhas.some((l) => /^para (que|)\s*\S+/.test(l));
    const faltando = [];
    if (!temComo) faltando.push('Como');
    if (!temQuero) faltando.push('Quero');
    if (!temPara) faltando.push('Para que');
    return {
      conforme: faltando.length === 0,
      evidencia: faltando.length ? `Elemento(s) ausente(s) na narrativa: ${faltando.join(', ')}` : 'Narrativa completa nos três elementos',
    };
  },

  papelEspecifico(a) {
    const linha = a.narrativa.split('\n').find((l) => /^como\s+/i.test(semAcento(l).trim().toLowerCase()));
    if (!linha) return { conforme: false, evidencia: 'Não foi possível identificar o papel (linha "Como" ausente)' };
    const papel = linha.replace(/^[Cc]omo\s+/, '').split(',')[0].trim();
    const primeiraPalavra = semAcento(papel).toLowerCase().split(/\s+/)[0];
    const conforme = papel.length > 0 && !PAPEIS_GENERICOS.includes(primeiraPalavra);
    return { conforme, evidencia: `Papel declarado: "${papel}"` };
  },

  quantidadeCriterios(a) {
    const total = a.criterios.length;
    return {
      conforme: total >= 3,
      evidencia: `${total} critério(s) de aceitação encontrado(s); mínimo exigido: 3`,
    };
  },

  formatoCriterios(a) {
    if (a.criterios.length === 0) {
      return { conforme: false, evidencia: 'Nenhum critério de aceitação para avaliar' };
    }
    const foraDoPadrao = a.criterios.filter((c) => {
      const t = semAcento(c).toLowerCase();
      return !(t.includes('dado') && t.includes('quando') && t.includes('entao'));
    });
    return {
      conforme: foraDoPadrao.length === 0,
      evidencia: foraDoPadrao.length
        ? `${foraDoPadrao.length} critério(s) fora do padrão Dado/Quando/Então. Primeiro: "${foraDoPadrao[0].slice(0, 90)}"`
        : 'Todos os critérios seguem Dado/Quando/Então',
    };
  },

  ambiguidade(a) {
    const encontrados = TERMOS_AMBIGUOS.filter((termo) => contem(a.conteudo, termo));
    return {
      conforme: encontrados.length === 0,
      evidencia: encontrados.length
        ? `Termo(s) não verificável(is) no texto: ${encontrados.join(', ')}`
        : 'Nenhum termo ambíguo identificado',
    };
  },

  estimativa(a) {
    const valor = (a.campos['estimativa'] || '').trim();
    return {
      conforme: ESCALA_FIBONACCI.includes(valor),
      evidencia: valor
        ? `Estimativa "${valor}" fora da escala 1, 2, 3, 5, 8, 13`
        : 'Estimativa não informada',
    };
  },

  prioridade(a) {
    const valor = (a.campos['prioridade'] || '').trim();
    const conforme = PRIORIDADES.includes(semAcento(valor).toLowerCase());
    return {
      conforme,
      evidencia: valor ? `Prioridade = "${valor}"` : 'Prioridade não informada',
    };
  },

  responsavel(a) {
    const valor = (a.campos['responsavel'] || '').trim();
    return {
      conforme: valor.length >= 3,
      evidencia: valor ? `Responsável = "${valor}"` : 'Responsável não informado',
    };
  },

  rastreabilidade(a) {
    const valor = (a.campos['requisito'] || '').trim();
    return {
      conforme: /RF-\d{3}/.test(valor),
      evidencia: valor ? `Requisito vinculado = "${valor}"` : 'Nenhum requisito funcional vinculado',
    };
  },

  dependencias(a) {
    const valor = (a.campos['dependencias'] || '').trim();
    return {
      conforme: valor.length > 0,
      evidencia: valor ? `Dependências = "${valor}"` : 'Campo de dependências ausente ou vazio',
    };
  },

  regrasNegocio(a) {
    const numeradas = a.regras.filter((r) => /RN-\d{2}/.test(r));
    return {
      conforme: numeradas.length > 0,
      evidencia: numeradas.length
        ? `${numeradas.length} regra(s) de negócio numerada(s)`
        : 'Seção de regras de negócio vazia ou sem numeração RN-00',
    };
  },
};

module.exports = { regras };
