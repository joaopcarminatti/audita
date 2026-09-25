'use strict';

const { executarAuditoria, carregarConfig } = require('./auditoria');
const ncs = require('./ncs');
const relatorio = require('./relatorio');
const comunicacao = require('./comunicacao');
const historico = require('./historico');

/**
 * Uma única definição do ciclo de auditoria, usada tanto pela linha de comando
 * quanto pelo painel: auditar → sincronizar NCs → escalonar → relatar → comunicar → historiar.
 */
async function executarCiclo(quando = new Date().toISOString()) {
  const config = carregarConfig();
  const auditoria = executarAuditoria();

  const sync = await ncs.sincronizar(auditoria, config, quando);
  const escalonadas = await ncs.verificarPrazos(config, quando);
  const indicadores = ncs.indicadores(quando);

  const caminho = relatorio.gerar(auditoria);
  await comunicacao.comunicarRelatorio(config, auditoria, caminho, quando);

  const entrada = historico.registrar(
    auditoria,
    {
      abertas: sync.abertas.length,
      encerradas: sync.encerradas.length,
      escalonadas: escalonadas.length,
      pendentes: indicadores.pendentes,
    },
    quando
  );

  return { config, auditoria, sync, escalonadas, indicadores, caminho, entrada };
}

module.exports = { executarCiclo };
