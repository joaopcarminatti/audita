'use strict';

const fs = require('fs');
const path = require('path');
const { COMUNICACOES, DADOS, lerJson, gravarJson } = require('./caminhos');
const { escapar } = require('./estilo');

const LOG = path.join(DADOS, 'comunicacoes.json');

const lerLog = () => lerJson(LOG, []);
const gravarLog = (log) => gravarJson(LOG, log);

function limparLog() {
  gravarLog([]);
  if (fs.existsSync(COMUNICACOES)) {
    for (const f of fs.readdirSync(COMUNICACOES)) fs.unlinkSync(path.join(COMUNICACOES, f));
  }
}

const emailDo = (config, responsavel) => config.equipe[responsavel] || config.emailPadrao;

/** Destinatários crescem conforme o nível de escalonamento da NC. */
function destinatarios(config, nc) {
  const lista = [emailDo(config, nc.responsavel)];
  for (const nivel of config.escalonamento) {
    if (nivel.nivel > 1 && nivel.nivel <= nc.nivelEscalonamento) lista.push(nivel.contato);
  }
  return [...new Set([...lista, ...config.copiaSempre])];
}

const CORES = { 'Crítica': '#A62B1F', 'Alta': '#B4690E', 'Média': '#7A6A19', 'Baixa': '#3F5A66' };

/** Todo conteúdo vindo do artefato é escapado: um artefato com HTML não quebra a mensagem. */
function corpoHtml({ assunto, chamada, severidade, linhas, rodape }) {
  const cor = CORES[severidade] || '#16624C';
  const tabela = linhas
    .map(
      ([rotulo, valor]) => `<tr>
        <td style="padding:7px 14px 7px 0;color:#5B6B7A;white-space:nowrap;vertical-align:top">${escapar(rotulo)}</td>
        <td style="padding:7px 0;color:#101A20;vertical-align:top">${escapar(valor)}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${escapar(assunto)}</title></head>
<body style="margin:0;background:#EEF1F0;font-family:'Segoe UI',system-ui,-apple-system,sans-serif">
  <div style="max-width:640px;margin:32px auto;background:#fff;border:1px solid #D3DAD8">
    <div style="border-top:5px solid ${cor};padding:24px 28px 8px">
      <div style="font-size:13px;color:#5B6B7A">Auditoria automatizada de qualidade</div>
      <h1 style="margin:6px 0 0;font-size:21px;line-height:1.3;color:#101A20;font-weight:600">${escapar(assunto)}</h1>
    </div>
    <div style="padding:4px 28px 24px">
      <p style="color:#101A20;line-height:1.55;font-size:15px">${chamada}</p>
      <table style="border-collapse:collapse;font-size:14px;width:100%;border-top:1px solid #E4E9E7;margin-top:8px">${tabela}</table>
      <p style="margin-top:22px;font-size:13px;color:#5B6B7A;line-height:1.5">${escapar(rodape)}</p>
    </div>
  </div>
</body></html>`;
}

const dataBR = (iso) => new Date(iso).toLocaleDateString('pt-BR');

async function enviar(config, { tipo, assunto, para, html, resumoTexto, nc, quando = new Date().toISOString() }) {
  fs.mkdirSync(COMUNICACOES, { recursive: true });
  const log = lerLog();
  const sequencia = (log.reduce((max, c) => Math.max(max, Number(String(c.id).replace(/\D/g, '')) || 0), 0) || 0) + 1;

  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  const arquivo = `${carimbo}__${tipo}${nc ? '__' + nc.id : ''}.html`;
  fs.writeFileSync(path.join(COMUNICACOES, arquivo), html);

  const registro = {
    id: `COM-${String(sequencia).padStart(4, '0')}`,
    tipo,
    assunto,
    para,
    ncId: nc ? nc.id : null,
    artefato: nc ? nc.artefato : null,
    enviadoEm: quando,
    canal: process.env.WEBHOOK_URL ? 'e-mail (arquivo) + webhook' : 'e-mail (arquivo)',
    arquivo: `comunicacoes/${arquivo}`,
    resumo: resumoTexto,
  };

  if (process.env.WEBHOOK_URL) {
    try {
      const controle = AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined;
      await fetch(process.env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `*${assunto}*\n${resumoTexto}\nDestinatários: ${para.join(', ')}` }),
        signal: controle,
      });
    } catch (erro) {
      // A indisponibilidade do canal externo não pode interromper a auditoria:
      // a comunicação fica registrada e o erro fica documentado no log.
      registro.canal = 'e-mail (arquivo) — webhook indisponível';
      registro.erroWebhook = String(erro.message || erro);
    }
  }

  log.push(registro);
  gravarLog(log);
  return registro;
}

function comunicarAbertura(config, nc, quando) {
  const html = corpoHtml({
    assunto: `[NC ${nc.severidade}] ${nc.id} — ${nc.artefato}: ${nc.descricaoItem}`,
    chamada: `A auditoria automatizada do checklist <strong>${escapar(nc.checklist)}</strong> registrou uma não-conformidade no artefato <strong>${escapar(nc.artefato)}</strong>. A correção é de responsabilidade de <strong>${escapar(nc.responsavel)}</strong>.`,
    severidade: nc.severidade,
    linhas: [
      ['Não-conformidade', nc.id],
      ['Item do checklist', `${nc.itemId} — ${nc.descricaoItem}`],
      ['Severidade', nc.severidade],
      ['Evidência', nc.evidencia],
      ['Ação corretiva', nc.acaoCorretiva],
      ['Prazo (SLA)', dataBR(nc.prazo)],
    ],
    rodape: 'Ao corrigir o artefato, execute a auditoria novamente: a verificação é automática e encerra a NC. Prazo vencido gera escalonamento para o próximo nível.',
  });
  return enviar(config, {
    tipo: 'abertura-nc',
    assunto: `[NC ${nc.severidade}] ${nc.id} — ${nc.artefato}`,
    para: destinatarios(config, nc),
    html,
    resumoTexto: `${nc.itemId}: ${nc.evidencia}`,
    nc,
    quando,
  });
}

function comunicarEscalonamento(config, nc, nivelAnterior, quando) {
  const nivel = config.escalonamento.find((n) => n.nivel === nc.nivelEscalonamento);
  const html = corpoHtml({
    assunto: `[Escalonamento N${nc.nivelEscalonamento}] ${nc.id} — prazo vencido`,
    chamada: `A não-conformidade <strong>${escapar(nc.id)}</strong> ultrapassou o prazo de correção e foi escalonada do nível ${nivelAnterior} para o nível <strong>${nc.nivelEscalonamento} — ${escapar(nivel.papel)}</strong>.`,
    severidade: nc.severidade,
    linhas: [
      ['Artefato', `${nc.artefato} — ${nc.descricaoItem}`],
      ['Severidade', nc.severidade],
      ['Aberta em', dataBR(nc.abertaEm)],
      ['Prazo original', dataBR(nc.prazoOriginal)],
      ['Novo prazo', dataBR(nc.prazo)],
      ['Responsável', nc.responsavel],
      ['Instância acionada', `${nivel.papel} (${nivel.contato})`],
    ],
    rodape: 'Escalonamento automático conforme a matriz definida em config.json. O próximo vencimento aciona o nível seguinte.',
  });
  return enviar(config, {
    tipo: 'escalonamento',
    assunto: `[Escalonamento N${nc.nivelEscalonamento}] ${nc.id} — ${nc.artefato}`,
    para: destinatarios(config, nc),
    html,
    resumoTexto: `Prazo vencido. Acionado: ${nivel.papel}.`,
    nc,
    quando,
  });
}

function comunicarEncerramento(config, nc, quando) {
  const html = corpoHtml({
    assunto: `[NC encerrada] ${nc.id} — ${nc.artefato}`,
    chamada: `A correção do artefato <strong>${escapar(nc.artefato)}</strong> foi verificada automaticamente na reauditoria e a não-conformidade <strong>${escapar(nc.id)}</strong> está encerrada.`,
    severidade: null,
    linhas: [
      ['Item do checklist', `${nc.itemId} — ${nc.descricaoItem}`],
      ['Evidência da correção', nc.evidenciaCorrecao || 'Item conforme na reauditoria'],
      ['Aberta em', dataBR(nc.abertaEm)],
      ['Encerrada em', dataBR(nc.fechadaEm)],
      ['Tempo até a resolução', `${nc.diasAteResolucao} dia(s)`],
      ['Nível final de escalonamento', `N${nc.nivelEscalonamento}`],
    ],
    rodape: 'Registro mantido no histórico para análise de reincidência e indicadores da qualidade.',
  });
  return enviar(config, {
    tipo: 'encerramento-nc',
    assunto: `[NC encerrada] ${nc.id} — ${nc.artefato}`,
    para: destinatarios(config, nc),
    html,
    resumoTexto: 'Correção verificada na reauditoria.',
    nc,
    quando,
  });
}

function comunicarRelatorio(config, auditoria, caminhoRelatorio, quando) {
  const r = auditoria.resumo;
  const html = corpoHtml({
    assunto: `Relatório de auditoria — aderência de ${r.aderencia}%`,
    chamada: `Auditoria do checklist <strong>${escapar(auditoria.checklist.nome)}</strong> concluída em ${new Date(auditoria.executadaEm).toLocaleString('pt-BR')}.`,
    severidade: r.atingiuMeta ? null : 'Alta',
    linhas: [
      ['Projeto', auditoria.projeto],
      ['Artefatos auditados', String(r.artefatosAuditados)],
      ['Itens verificados', String(r.itensVerificados)],
      ['Aderência', `${r.aderencia}% (${r.pontosObtidos} de ${r.pontosPossiveis} pontos)`],
      ['Meta', `${r.meta}% — ${r.atingiuMeta ? 'atingida' : 'não atingida'}`],
      ['Resultado', r.resultado],
      ['Não-conformidades', `${r.naoConformidades} (Crítica ${r.porSeveridade['Crítica']}, Alta ${r.porSeveridade['Alta']}, Média ${r.porSeveridade['Média']}, Baixa ${r.porSeveridade['Baixa']})`],
      ['Relatório completo', caminhoRelatorio],
    ],
    rodape: 'Distribuição automática para o time e para a célula de qualidade.',
  });
  return enviar(config, {
    tipo: 'relatorio-auditoria',
    assunto: `Relatório de auditoria — ${r.aderencia}% de aderência`,
    para: [...new Set([...Object.values(config.equipe), ...config.copiaSempre])],
    html,
    resumoTexto: `${r.naoConformidades} NC(s) em ${r.artefatosAuditados} artefatos.`,
    quando,
  });
}

module.exports = {
  enviar, comunicarAbertura, comunicarEscalonamento, comunicarEncerramento,
  comunicarRelatorio, lerLog, limparLog, destinatarios,
};
