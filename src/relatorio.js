'use strict';

const fs = require('fs');
const path = require('path');
const { RAIZ, RELATORIOS } = require('./caminhos');
const { CSS, CORES_SEVERIDADE, selo, barra, escapar, cor } = require('./estilo');
const ncsRepo = require('./ncs');
const comunicacao = require('./comunicacao');
const historico = require('./historico');
const { carregarConfig } = require('./auditoria');

const dataBR = (iso) => new Date(iso).toLocaleDateString('pt-BR');
const dataHoraBR = (iso) => new Date(iso).toLocaleString('pt-BR');

function tabelaArtefatos(auditoria) {
  const linhas = auditoria.artefatos
    .map(
      (a) => `<tr>
      <td><b>${escapar(a.artefato)}</b><span class="evidencia">${escapar(a.titulo)}</span></td>
      <td>${escapar(a.responsavel || '—')}</td>
      <td><span class="celula-barra">${barra(a.percentual)}<b style="font-variant-numeric:tabular-nums">${a.percentual}%</b></span></td>
      <td class="num">${a.obtido}/${a.total}</td>
      <td class="num">${a.verificacoes.filter((v) => !v.conforme).length}</td>
      <td style="color:${cor(a.percentual)};font-weight:600">${escapar(a.resultado)}</td>
    </tr>`
    )
    .join('');

  return `<table>
    <thead><tr><th>Artefato</th><th>Responsável</th><th>Aderência</th><th class="num">Pontos</th><th class="num">NCs</th><th>Resultado</th></tr></thead>
    <tbody>${linhas}</tbody></table>`;
}

function tabelaCategorias(auditoria) {
  const linhas = auditoria.porCategoria
    .slice()
    .sort((a, b) => a.percentual - b.percentual)
    .map(
      (c) => `<tr>
        <td>${escapar(c.categoria)}</td>
        <td><span class="celula-barra">${barra(c.percentual)}<b style="font-variant-numeric:tabular-nums">${c.percentual}%</b></span></td>
        <td class="num">${c.obtido}/${c.total}</td>
        <td class="num">${c.naoConformes}</td>
      </tr>`
    )
    .join('');
  return `<table>
    <thead><tr><th>Categoria do checklist</th><th>Aderência</th><th class="num">Pontos</th><th class="num">Itens não-conformes</th></tr></thead>
    <tbody>${linhas}</tbody></table>
    <p class="sub">A categoria com menor aderência indica onde o processo falha com mais frequência — é a prioridade de ação do time.</p>`;
}

function evolucao(linhaDoTempo) {
  if (linhaDoTempo.length < 2) {
    return '<p class="sub">A evolução aparece a partir da segunda execução da auditoria.</p>';
  }
  const barras = linhaDoTempo
    .slice(-12)
    .map((e) => {
      const altura = Math.max(3, Math.round(e.aderencia));
      return `<div class="col" title="${dataHoraBR(e.em)} — ${e.aderencia}%">
        <div class="valor">${e.aderencia}%</div>
        <div class="haste" style="height:${altura}%;background:${cor(e.aderencia)}"></div>
        <div class="rot">${dataBR(e.em)}</div>
      </div>`;
    })
    .join('');
  const ultima = linhaDoTempo[linhaDoTempo.length - 1];
  const variacao =
    ultima.variacao === null ? ''
    : ultima.variacao === 0 ? '<p class="sub">A aderência se manteve estável na última execução.</p>'
    : `<p class="sub">Variação na última execução: <b style="color:${ultima.variacao > 0 ? 'var(--aprovado)' : 'var(--reprovado)'}">${ultima.variacao > 0 ? '+' : ''}${ultima.variacao} ponto(s) percentual(is)</b>.</p>`;
  return `<div class="grafico">${barras}</div>${variacao}`;
}

function tabelaNCs(ncs) {
  if (ncs.length === 0) return '<p class="sub">Nenhuma não-conformidade registrada.</p>';
  const linhas = ncs
    .map(
      (n) => `<tr>
      <td><b>${escapar(n.id)}</b></td>
      <td>${escapar(n.artefato)} · ${escapar(n.itemId)}<span class="evidencia">${escapar(n.descricaoItem)}</span>
        <span class="evidencia">Evidência: ${escapar(n.evidencia)}</span></td>
      <td><span class="chip" style="color:${CORES_SEVERIDADE[n.severidade]}">${escapar(n.severidade)}</span></td>
      <td>${escapar(n.responsavel)}</td>
      <td>${escapar(n.status)}<span class="evidencia">N${n.nivelEscalonamento}${n.reincidencias ? ` · ${n.reincidencias}ª reincidência` : ''}</span></td>
      <td>${dataBR(n.prazo)}<span class="evidencia">aberta ${dataBR(n.abertaEm)}</span></td>
    </tr>`
    )
    .join('');
  return `<table>
    <thead><tr><th>NC</th><th>Origem</th><th>Severidade</th><th>Responsável</th><th>Status</th><th>Prazo</th></tr></thead>
    <tbody>${linhas}</tbody></table>`;
}

function matrizEscalonamento(config) {
  const sla = Object.entries(config.slaDias)
    .map(([sev, dias]) => `<tr><td><span class="chip" style="color:${CORES_SEVERIDADE[sev]}">${escapar(sev)}</span></td><td>${dias} dia(s)</td></tr>`)
    .join('');
  const niveis = config.escalonamento
    .map((n) => `<tr><td>N${n.nivel}</td><td>${escapar(n.papel)}</td><td>${escapar(n.contato)}</td></tr>`)
    .join('');
  return `<div style="display:flex;gap:40px;flex-wrap:wrap">
    <div style="flex:1;min-width:230px">
      <h3>Prazo por severidade</h3>
      <table><thead><tr><th>Severidade</th><th>SLA</th></tr></thead><tbody>${sla}</tbody></table>
    </div>
    <div style="flex:2;min-width:300px">
      <h3>Níveis de escalonamento</h3>
      <table><thead><tr><th>Nível</th><th>Instância acionada</th><th>Contato</th></tr></thead><tbody>${niveis}</tbody></table>
    </div>
  </div>
  <p class="sub">A cada prazo vencido a NC sobe um nível e recebe novo prazo; a comunicação passa a incluir a instância acionada.</p>`;
}

function tabelaComunicacoes(log) {
  if (log.length === 0) return '<p class="sub">Nenhuma comunicação emitida.</p>';
  const linhas = log
    .slice(-25)
    .reverse()
    .map(
      (c) => `<tr>
      <td>${dataHoraBR(c.enviadoEm)}</td>
      <td>${escapar(c.tipo)}</td>
      <td>${escapar(c.assunto)}<span class="evidencia">${escapar(c.resumo || '')}</span></td>
      <td>${escapar(c.para.join(', '))}<span class="evidencia">${escapar(c.canal)}</span></td>
    </tr>`
    )
    .join('');
  return `<table>
    <thead><tr><th>Data</th><th>Tipo</th><th>Assunto</th><th>Destinatários</th></tr></thead>
    <tbody>${linhas}</tbody></table>`;
}

function detalhamento(auditoria) {
  return auditoria.artefatos
    .map((a) => {
      const itens = a.verificacoes
        .map(
          (v) => `<li>
            <span class="marca ${v.conforme ? 'conforme' : 'naoconforme'}">${v.conforme ? '✓' : '✗'}</span>
            <span><b>${escapar(v.itemId)}</b> ${escapar(v.descricao)} <span style="color:var(--apagado)">· peso ${v.peso}${v.conforme ? '' : ` · ${escapar(v.severidade)}`}</span>
            <span class="evidencia">${escapar(v.evidencia)}</span></span>
          </li>`
        )
        .join('');
      return `<div class="artefato-bloco">
        <div class="linha-topo">
          <h3>${escapar(a.artefato)} — ${escapar(a.titulo)}</h3>
          <span style="color:${cor(a.percentual)};font-weight:600">${a.percentual}% · ${escapar(a.resultado)}</span>
        </div>
        <ul class="item-lista">${itens}</ul>
      </div>`;
    })
    .join('');
}

function gerarHtml(auditoria) {
  const r = auditoria.resumo;
  const config = carregarConfig();
  const ncs = ncsRepo.listar();
  const ind = ncsRepo.indicadores();
  const log = comunicacao.lerLog();
  const linhaDoTempo = historico.listar();

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatório de auditoria — ${escapar(auditoria.projeto)}</title>
<style>${CSS}</style></head>
<body><div class="folha">

<div class="cabecalho">
  <div>
    <h1>Relatório de auditoria da qualidade</h1>
    <p class="sub">${escapar(auditoria.checklist.nome)} · versão ${escapar(auditoria.checklist.versao)}</p>
  </div>
  <div class="meta">
    Projeto <b>${escapar(auditoria.projeto)}</b><br>
    Auditor <b>${escapar(auditoria.auditor)}</b><br>
    Execução <b>${dataHoraBR(auditoria.executadaEm)}</b>
  </div>
</div>

<div class="selo-area">
  ${selo(r.aderencia, r.resultado)}
  <div class="numeros">
    <div class="numero"><div class="v">${r.artefatosAuditados}</div><div class="r">artefatos auditados</div></div>
    <div class="numero"><div class="v">${r.itensVerificados}</div><div class="r">itens verificados</div></div>
    <div class="numero"><div class="v">${r.pontosObtidos}<span style="color:var(--apagado);font-size:18px">/${r.pontosPossiveis}</span></div><div class="r">pontos de conformidade</div></div>
    <div class="numero"><div class="v">${ind.pendentes}</div><div class="r">NCs pendentes</div></div>
    <div class="numero"><div class="v">${ind.fechadas}</div><div class="r">NCs encerradas</div></div>
    <div class="numero"><div class="v">${ind.escalonadas}</div><div class="r">NCs escalonadas</div></div>
    <div class="numero"><div class="v">${ind.tempoMedioResolucao === null ? '—' : ind.tempoMedioResolucao}</div><div class="r">dias até a resolução (média)</div></div>
  </div>
</div>

<p class="sub">Aderência = pontos dos itens conformes ÷ pontos possíveis × 100.
Classificação: 90% ou mais aprovado; de 70% a 89,9% aprovado com ressalvas; abaixo de 70% reprovado.
<span class="meta-linha" style="color:${r.atingiuMeta ? 'var(--aprovado)' : 'var(--ressalva)'}">meta de ${r.meta}% ${r.atingiuMeta ? 'atingida' : 'não atingida'}</span></p>

<h2>Evolução entre auditorias</h2>
${evolucao(linhaDoTempo)}

<h2>Aderência por artefato</h2>
${tabelaArtefatos(auditoria)}

<h2>Aderência por categoria do checklist</h2>
${tabelaCategorias(auditoria)}

<h2>Não-conformidades e acompanhamento</h2>
${tabelaNCs(ncs)}

<h2>Prazos e matriz de escalonamento</h2>
${matrizEscalonamento(config)}

<h2>Comunicações emitidas</h2>
${tabelaComunicacoes(log)}

<h2>Verificação item a item</h2>
${detalhamento(auditoria)}

<p class="rodape">Documento gerado automaticamente pela ferramenta Audita.
Itens, pesos e severidades conforme <b>${escapar(auditoria.checklist.id)}</b>; prazos e escalonamento conforme <b>config.json</b>.</p>
</div></body></html>`;
}

function gerar(auditoria) {
  fs.mkdirSync(RELATORIOS, { recursive: true });
  const html = gerarHtml(auditoria);
  const carimbo = auditoria.executadaEm.replace(/[:.]/g, '-');
  const arquivo = path.join(RELATORIOS, `auditoria-${carimbo}.html`);
  fs.writeFileSync(arquivo, html);
  fs.writeFileSync(path.join(RELATORIOS, 'ultimo-relatorio.html'), html);
  return path.relative(RAIZ, arquivo);
}

module.exports = { gerar, gerarHtml };
