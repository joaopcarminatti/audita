'use strict';

/**
 * Leitura do artefato: transforma o arquivo Markdown da História de Usuário
 * em uma estrutura que as regras do checklist conseguem inspecionar.
 */

function semAcento(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function chaveNormalizada(texto) {
  return semAcento(texto).toLowerCase().trim().replace(/\s+/g, '-');
}

function parseArtefato(conteudo, arquivo) {
  const linhas = conteudo.split(/\r?\n/);

  const linhaTitulo = linhas.find((l) => /^#\s+/.test(l)) || '';
  const tituloBruto = linhaTitulo.replace(/^#\s+/, '').trim();
  const partes = tituloBruto.split(/\s+[—–-]\s+/);
  const tituloDescritivo = partes.length > 1 ? partes.slice(1).join(' - ').trim() : tituloBruto;

  const campos = {};
  const secoes = {};
  let secaoAtual = null;

  for (const linha of linhas) {
    const cabecalhoSecao = linha.match(/^##\s+(.+)$/);
    if (cabecalhoSecao) {
      secaoAtual = chaveNormalizada(cabecalhoSecao[1]);
      secoes[secaoAtual] = [];
      continue;
    }

    // Campos são reconhecidos em qualquer ponto do arquivo: se o autor mover o
    // cabeçalho para o fim do documento, a auditoria continua encontrando os dados.
    const campo = linha.match(/^\*\*(.+?):\*\*\s*(.*)$/);
    if (campo) {
      const chave = chaveNormalizada(campo[1]);
      if (!(chave in campos)) campos[chave] = campo[2].trim();
      continue;
    }

    if (secaoAtual) secoes[secaoAtual].push(linha);
  }

  const bloco = (nome) => (secoes[nome] || []).join('\n').trim();
  const listaDe = (nome) =>
    (secoes[nome] || [])
      .map((l) => l.trim())
      .filter((l) => /^[-*]\s+/.test(l))
      .map((l) => l.replace(/^[-*]\s+/, '').trim());

  return {
    arquivo,
    id: arquivo.replace(/\.md$/i, ''),
    tituloBruto,
    tituloDescritivo,
    campos,
    secoes,
    narrativa: bloco('narrativa'),
    criterios: listaDe('criterios-de-aceitacao'),
    regras: listaDe('regras-de-negocio'),
    conteudo,
  };
}

module.exports = { parseArtefato, semAcento, chaveNormalizada };
