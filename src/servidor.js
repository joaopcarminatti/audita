'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { executarAuditoria, carregarConfig } = require('./auditoria');
const { executarCiclo } = require('./ciclo');
const ncsRepo = require('./ncs');
const comunicacao = require('./comunicacao');
const historico = require('./historico');
const { CSS } = require('./estilo');

const RAIZ = path.resolve(__dirname, '..');

function agora(dias) {
  const d = new Date();
  if (dias) d.setDate(d.getDate() + Number(dias));
  return d.toISOString();
}

function estadoAtual(dias, mensagem) {
  const config = carregarConfig();
  return {
    auditoria: executarAuditoria(),
    ncs: ncsRepo.listar(),
    indicadores: ncsRepo.indicadores(agora(dias)),
    comunicacoes: comunicacao.lerLog(),
    historico: historico.listar(),
    escalonamento: config.escalonamento,
    slaDias: config.slaDias,
    dataSimulada: dias ? agora(dias) : null,
    mensagem: mensagem || '',
  };
}

function json(res, dados, codigo = 200) {
  const corpo = JSON.stringify(dados);
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(corpo);
}

function lerCorpo(req) {
  return new Promise((resolve) => {
    let dados = '';
    req.on('data', (c) => (dados += c));
    req.on('end', () => {
      try { resolve(dados ? JSON.parse(dados) : {}); } catch { resolve({}); }
    });
  });
}

function servirArquivo(res, arquivo, tipo) {
  if (!fs.existsSync(arquivo)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Arquivo ainda não gerado. Execute a auditoria primeiro.');
  }
  res.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(arquivo));
}

async function rotear(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const rota = url.pathname;

  if (rota === '/' || rota === '/index.html') {
    const html = fs.readFileSync(path.join(__dirname, 'painel.html'), 'utf8').replace('{{CSS}}', CSS);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  if (rota === '/api/estado') {
    return json(res, estadoAtual(Number(url.searchParams.get('dias') || 0)));
  }

  if (rota === '/api/auditar' && req.method === 'POST') {
    const { dias } = await lerCorpo(req);
    const { auditoria, sync, escalonadas, entrada } = await executarCiclo(agora(dias));
    const variacao =
      entrada.variacao === null ? ''
      : entrada.variacao === 0 ? ' Sem variação desde a auditoria anterior.'
      : ` Variação de ${entrada.variacao > 0 ? '+' : ''}${entrada.variacao} p.p. desde a auditoria anterior.`;
    const msg =
      `Auditoria concluída: aderência de ${auditoria.resumo.aderencia}%.${variacao} ` +
      `${sync.abertas.length} NC(s) aberta(s), ${sync.encerradas.length} encerrada(s), ` +
      `${escalonadas.length} escalonada(s). Relatório e comunicações atualizados.`;
    return json(res, estadoAtual(dias, msg));
  }

  if (rota === '/api/prazos' && req.method === 'POST') {
    const { dias } = await lerCorpo(req);
    const escalonadas = await ncsRepo.verificarPrazos(carregarConfig(), agora(dias));
    const msg = escalonadas.length
      ? `${escalonadas.length} NC(s) com prazo vencido escalonada(s) e comunicada(s).`
      : 'Nenhuma NC com prazo vencido nesta data.';
    return json(res, estadoAtual(dias, msg));
  }

  if (rota === '/api/nc/assumir' && req.method === 'POST') {
    const { id, responsavel, dias } = await lerCorpo(req);
    try {
      const nc = ncsRepo.assumir(id, responsavel, agora(dias));
      return json(res, estadoAtual(dias, `${nc.id} está em correção com ${nc.responsavel}.`));
    } catch (erro) {
      return json(res, { erro: erro.message }, 400);
    }
  }

  if (rota === '/relatorio') {
    return servirArquivo(res, path.join(RAIZ, 'relatorios', 'ultimo-relatorio.html'), 'text/html; charset=utf-8');
  }

  if (rota.startsWith('/comunicacoes/')) {
    const nome = path.basename(decodeURIComponent(rota));
    return servirArquivo(res, path.join(RAIZ, 'comunicacoes', nome), 'text/html; charset=utf-8');
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Rota não encontrada');
}

function iniciar(porta = 3000) {
  const servidor = http.createServer((req, res) => {
    rotear(req, res).catch((erro) => {
      console.error(erro);
      json(res, { erro: erro.message }, 500);
    });
  });
  servidor.listen(porta, () => {
    console.log(`\n  Painel de qualidade em http://localhost:${porta}`);
    console.log('  Encerre com Ctrl+C\n');
  });
  return servidor;
}

module.exports = { iniciar, estadoAtual };
