#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { executarAuditoria, carregarConfig } = require('./src/auditoria');
const { executarCiclo } = require('./src/ciclo');
const ncsRepo = require('./src/ncs');
const relatorio = require('./src/relatorio');
const comunicacao = require('./src/comunicacao');
const historico = require('./src/historico');

const COR = {
  reset: '\u001b[0m', forte: '\u001b[1m', fraco: '\u001b[2m',
  verde: '\u001b[32m', vermelho: '\u001b[31m', amarelo: '\u001b[33m', azul: '\u001b[36m',
};

const argv = process.argv.slice(2);
const comando = argv[0] || 'ajuda';

function opcao(nome, padrao = null) {
  const i = argv.indexOf(`--${nome}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : padrao;
}

const temOpcao = (nome) => argv.includes(`--${nome}`);

function agora() {
  const dias = Number(opcao('simular-dias', 0));
  const d = new Date();
  if (dias) d.setDate(d.getDate() + dias);
  return d.toISOString();
}

function titulo(texto) {
  console.log(`\n${COR.forte}${texto}${COR.reset}\n${'─'.repeat(Math.min(72, texto.length + 12))}`);
}

const corAderencia = (p) => (p >= 90 ? COR.verde : p >= 70 ? COR.amarelo : COR.vermelho);

function barraTexto(p) {
  const cheio = Math.round(p / 5);
  return `${'█'.repeat(cheio)}${'░'.repeat(20 - cheio)}`;
}

/** Fluxo completo: auditar, sincronizar NCs, escalonar, relatar e comunicar. */
async function cicloCompleto({ silencioso = false } = {}) {
  const resultado = await executarCiclo(agora());
  const { auditoria, sync, escalonadas, caminho, entrada, config } = resultado;
  const r = auditoria.resumo;
  if (silencioso) return resultado;

  titulo(`Auditoria de qualidade — ${auditoria.projeto}`);
  console.log(`${COR.fraco}Checklist:${COR.reset} ${auditoria.checklist.nome} (${auditoria.checklist.id})`);
  console.log(`${COR.fraco}Execução: ${new Date(auditoria.executadaEm).toLocaleString('pt-BR')}${COR.reset}\n`);

  for (const a of auditoria.artefatos) {
    const c = corAderencia(a.percentual);
    console.log(
      `  ${a.artefato.padEnd(8)} ${c}${barraTexto(a.percentual)}${COR.reset} ` +
        `${String(a.percentual).padStart(5)}%  ${String(a.obtido + '/' + a.total).padEnd(7)} pts  ${c}${a.resultado}${COR.reset}`
    );
  }

  const c = corAderencia(r.aderencia);
  console.log(`\n  ${COR.forte}ADERÊNCIA GLOBAL: ${c}${r.aderencia}%${COR.reset}${COR.forte} — ${r.resultado}${COR.reset}`);
  console.log(`  ${r.pontosObtidos} de ${r.pontosPossiveis} pontos · ${r.itensVerificados} itens verificados`);
  console.log(
    `  Meta de ${r.meta}%: ${r.atingiuMeta ? COR.verde + 'atingida' : COR.amarelo + 'não atingida'}${COR.reset}` +
      (entrada.variacao === null || entrada.variacao === 0
        ? ''
        : ` · variação desde a última auditoria: ${entrada.variacao > 0 ? COR.verde + '+' : COR.vermelho}${entrada.variacao}${COR.reset} p.p.`)
  );

  const pior = [...auditoria.porCategoria].sort((a, b) => a.percentual - b.percentual)[0];
  console.log(`  Categoria mais frágil: ${COR.forte}${pior.categoria}${COR.reset} (${pior.percentual}%)`);
  console.log(
    `  NCs detectadas: ${r.naoConformidades} ` +
      `(${COR.vermelho}Crítica ${r.porSeveridade['Crítica']}${COR.reset}, ` +
      `${COR.amarelo}Alta ${r.porSeveridade['Alta']}${COR.reset}, Média ${r.porSeveridade['Média']}, Baixa ${r.porSeveridade['Baixa']})`
  );

  titulo('Registro de não-conformidades');
  console.log(`  ${COR.vermelho}Abertas nesta execução:${COR.reset} ${sync.abertas.length}`);
  sync.abertas.forEach((n) =>
    console.log(`    ${n.id}  ${n.artefato} ${n.itemId}  ${n.severidade.padEnd(8)} prazo ${new Date(n.prazo).toLocaleDateString('pt-BR')}  →  ${n.responsavel}`)
  );
  console.log(`  ${COR.verde}Encerradas na reauditoria:${COR.reset} ${sync.encerradas.length}`);
  sync.encerradas.forEach((n) => console.log(`    ${n.id}  ${n.artefato} ${n.itemId}  resolvida em ${n.diasAteResolucao} dia(s)`));
  console.log(`  ${COR.azul}Pendentes de execuções anteriores:${COR.reset} ${sync.mantidas.length}`);

  if (escalonadas.length) {
    titulo('Escalonamento por prazo vencido');
    escalonadas.forEach((n) => {
      const nivel = config.escalonamento.find((x) => x.nivel === n.nivelEscalonamento);
      console.log(`  ${COR.amarelo}${n.id}${COR.reset}  ${n.artefato} ${n.itemId}  →  N${n.nivelEscalonamento} ${nivel.papel}`);
    });
  }

  titulo('Comunicação');
  console.log(`  ${comunicacao.lerLog().length} comunicação(ões) no log · arquivos em ./comunicacoes/`);
  console.log(`  Relatório: ${COR.forte}${caminho}${COR.reset}`);
  console.log(`  Painel:    node audita.js painel\n`);

  return resultado;
}

async function cmdAuditar() {
  const { auditoria } = await cicloCompleto();
  // Portão de qualidade: permite usar a ferramenta dentro de uma esteira de CI.
  if (temOpcao('exigir-meta')) {
    const limite = Number(opcao('exigir-meta', auditoria.resumo.meta));
    if (auditoria.resumo.aderencia < limite) {
      console.error(`${COR.vermelho}Portão de qualidade reprovado:${COR.reset} aderência de ${auditoria.resumo.aderencia}% abaixo do limite de ${limite}%.\n`);
      process.exitCode = 1;
    } else {
      console.log(`${COR.verde}Portão de qualidade aprovado:${COR.reset} ${auditoria.resumo.aderencia}% (limite ${limite}%).\n`);
    }
  }
}

/** Observa a pasta de artefatos e reaudita a cada alteração salva. */
async function cmdVigiar() {
  const config = carregarConfig();
  const pasta = path.join(__dirname, config.pastaArtefatos);
  console.log(`\n  Observando ${config.pastaArtefatos}/ — salve um artefato para disparar a reauditoria. Ctrl+C encerra.\n`);
  await cicloCompleto();

  let pendente = null;
  fs.watch(pasta, { persistent: true }, (_evento, arquivo) => {
    if (!arquivo || !arquivo.endsWith('.md')) return;
    clearTimeout(pendente);
    pendente = setTimeout(async () => {
      console.log(`\n${COR.azul}Alteração detectada em ${arquivo} — reauditando…${COR.reset}`);
      try {
        await cicloCompleto();
      } catch (erro) {
        console.error(`${COR.vermelho}Erro na reauditoria:${COR.reset} ${erro.message}`);
      }
    }, 400);
  });
}

async function cmdPrazos() {
  const config = carregarConfig();
  const escalonadas = await ncsRepo.verificarPrazos(config, agora());
  titulo('Verificação de prazos e escalonamento');
  if (!escalonadas.length) {
    console.log('  Nenhuma NC com prazo vencido.\n');
    return;
  }
  escalonadas.forEach((n) => {
    const nivel = config.escalonamento.find((x) => x.nivel === n.nivelEscalonamento);
    console.log(`  ${n.id}  ${n.artefato} ${n.itemId}  ${n.severidade}  →  N${n.nivelEscalonamento} ${nivel.papel} (${nivel.contato})`);
  });
  console.log(`\n  ${escalonadas.length} NC(s) escalonada(s); comunicações registradas em ./comunicacoes/\n`);
}

function cmdNcs() {
  const filtro = {};
  if (temOpcao('pendentes')) filtro.pendentes = true;
  if (opcao('status')) filtro.status = opcao('status');
  if (opcao('artefato')) filtro.artefato = opcao('artefato');
  if (opcao('severidade')) filtro.severidade = opcao('severidade');
  const ncs = ncsRepo.listar(filtro);
  const ind = ncsRepo.indicadores(agora());

  titulo(`Não-conformidades (${ncs.length})`);
  if (!ncs.length) {
    console.log('  Nada a exibir com esse filtro. Rode "node audita.js auditar" para gerar o registro.\n');
    return;
  }
  console.log(
    `${'NC'.padEnd(9)}${'ARTEFATO'.padEnd(10)}${'ITEM'.padEnd(7)}${'SEVERIDADE'.padEnd(12)}${'STATUS'.padEnd(14)}${'NÍVEL'.padEnd(7)}PRAZO`
  );
  for (const n of ncs) {
    const c = n.severidade === 'Crítica' ? COR.vermelho : n.severidade === 'Alta' ? COR.amarelo : '';
    const st = n.status === 'Fechada' ? COR.verde : '';
    const vencida = ncsRepo.ABERTOS.includes(n.status) && new Date(agora()) > new Date(n.prazo);
    console.log(
      `${n.id.padEnd(9)}${n.artefato.padEnd(10)}${n.itemId.padEnd(7)}${c}${n.severidade.padEnd(12)}${COR.reset}` +
        `${st}${n.status.padEnd(14)}${COR.reset}${('N' + n.nivelEscalonamento).padEnd(7)}` +
        `${new Date(n.prazo).toLocaleDateString('pt-BR')}${vencida ? ` ${COR.vermelho}vencida${COR.reset}` : ''}`
    );
  }
  console.log(
    `\n  Pendentes ${ind.pendentes} · Fechadas ${ind.fechadas} · Vencidas ${ind.vencidas} · Escalonadas ${ind.escalonadas} · Reincidentes ${ind.reincidentes}` +
      (ind.tempoMedioResolucao !== null ? ` · Tempo médio de resolução ${ind.tempoMedioResolucao} dia(s)` : '') + '\n'
  );
}

function cmdHistorico() {
  const id = argv[1];
  if (!id) throw new Error('Informe a NC: node audita.js historico NC-0001');
  const nc = ncsRepo.lerBase().ncs.find((n) => n.id === id.toUpperCase());
  if (!nc) throw new Error(`NC ${id} não encontrada`);
  titulo(`${nc.id} — ${nc.artefato} ${nc.itemId} (${nc.severidade})`);
  console.log(`  ${nc.descricaoItem}`);
  console.log(`  Evidência: ${nc.evidencia}`);
  console.log(`  Ação corretiva: ${nc.acaoCorretiva}`);
  console.log(`  Status: ${nc.status} · Nível N${nc.nivelEscalonamento} · Responsável ${nc.responsavel}\n`);
  nc.historico.forEach((h) =>
    console.log(`  ${new Date(h.em).toLocaleString('pt-BR')}  ${COR.forte}${h.evento}${COR.reset} — ${h.detalhe} ${COR.fraco}(${h.autor})${COR.reset}`)
  );
  console.log('');
}

function cmdEvolucao() {
  const linha = historico.listar();
  titulo('Evolução da aderência');
  if (!linha.length) {
    console.log('  Nenhuma auditoria registrada ainda.\n');
    return;
  }
  for (const e of linha.slice(-15)) {
    const c = corAderencia(e.aderencia);
    const delta = e.variacao === null ? '     ' : `${e.variacao >= 0 ? '+' : ''}${e.variacao}`.padStart(6);
    console.log(
      `  ${new Date(e.em).toLocaleString('pt-BR').padEnd(20)} ${c}${barraTexto(e.aderencia)}${COR.reset} ` +
        `${String(e.aderencia).padStart(5)}% ${delta} p.p.  ` +
        `+${e.ncsAbertas} / -${e.ncsEncerradas} NC · pendentes ${e.ncsPendentes}`
    );
  }
  console.log('');
}

function cmdAssumir() {
  if (!argv[1]) throw new Error('Informe a NC: node audita.js assumir NC-0001 --responsavel "Nome"');
  const nc = ncsRepo.assumir(argv[1].toUpperCase(), opcao('responsavel'), agora());
  console.log(`${COR.verde}${nc.id} agora está "${nc.status}" sob responsabilidade de ${nc.responsavel}.${COR.reset}`);
}

function cmdComentar() {
  if (!argv[1]) throw new Error('Informe a NC: node audita.js comentar NC-0001 "texto"');
  const texto = argv.slice(2).filter((a) => !a.startsWith('--') && a !== opcao('autor')).join(' ');
  const nc = ncsRepo.comentar(argv[1].toUpperCase(), texto, opcao('autor'), agora());
  console.log(`${COR.verde}Comentário registrado em ${nc.id}.${COR.reset}`);
}

function cmdCorrigir() {
  const alvo = argv[1];
  if (!alvo) throw new Error('Informe o artefato: node audita.js corrigir HU-003');
  const origem = path.join(__dirname, 'exemplos', `${alvo}-corrigido.md`);
  if (!fs.existsSync(origem)) throw new Error(`Não há correção de exemplo para ${alvo} em ./exemplos`);
  fs.copyFileSync(origem, path.join(__dirname, 'artefatos', `${alvo}.md`));
  console.log(`${COR.verde}${alvo}.md substituído pela versão corrigida.${COR.reset} Rode "node audita.js auditar" para a reauditoria.`);
}

function cmdRelatorio() {
  console.log(`Relatório gerado: ${relatorio.gerar(executarAuditoria())}`);
}

function cmdResetar() {
  const limpar = () => {
    ncsRepo.resetar();
    historico.limpar();
    console.log('Base de não-conformidades, histórico e comunicações zerados.');
  };
  if (temOpcao('confirmar')) return limpar();
  const pergunta = readline.createInterface({ input: process.stdin, output: process.stdout });
  pergunta.question('Isso apaga todas as NCs, o histórico e as comunicações. Confirmar? (s/N) ', (resposta) => {
    pergunta.close();
    if (/^s(im)?$/i.test(resposta.trim())) limpar();
    else console.log('Nada foi apagado.');
  });
}

function cmdAjuda() {
  console.log(`
${COR.forte}Audita — auditoria automatizada de qualidade de artefatos${COR.reset}

  node audita.js auditar              Auditoria completa: aderência, NCs, escalonamento, relatório e comunicação
  node audita.js vigiar               Reaudita sozinha a cada artefato salvo (demonstração ao vivo)
  node audita.js painel [--porta 3000]  Painel de acompanhamento no navegador
  node audita.js ncs [--pendentes] [--severidade Crítica] [--artefato HU-005]
  node audita.js historico NC-0001    Linha do tempo completa de uma NC
  node audita.js evolucao             Aderência de cada auditoria já executada
  node audita.js assumir NC-0001 --responsavel "Nome"
  node audita.js comentar NC-0001 "texto do andamento"
  node audita.js prazos               Verifica prazos e escalona
  node audita.js corrigir HU-003      Aplica a versão corrigida do artefato (demonstração)
  node audita.js relatorio            Apenas gera o relatório HTML
  node audita.js resetar [--confirmar]  Zera NCs, histórico e comunicações

  Opções globais
    --simular-dias N                  Avança o relógio em N dias (demonstrar escalonamento)
    --exigir-meta [N]                 Encerra com código de erro se a aderência ficar abaixo da meta (uso em CI)
    WEBHOOK_URL=...                   Envia as comunicações também para um webhook (Slack, Discord, Teams)

  Testes: npm test
`);
}

(async () => {
  try {
    switch (comando) {
      case 'auditar': await cmdAuditar(); break;
      case 'vigiar': await cmdVigiar(); break;
      case 'ncs': cmdNcs(); break;
      case 'historico': cmdHistorico(); break;
      case 'evolucao': cmdEvolucao(); break;
      case 'assumir': cmdAssumir(); break;
      case 'comentar': cmdComentar(); break;
      case 'prazos': await cmdPrazos(); break;
      case 'corrigir': cmdCorrigir(); break;
      case 'relatorio': cmdRelatorio(); break;
      case 'painel': require('./src/servidor').iniciar(Number(opcao('porta', 3000))); break;
      case 'resetar': cmdResetar(); break;
      default: cmdAjuda();
    }
  } catch (erro) {
    console.error(`\n${COR.vermelho}Erro:${COR.reset} ${erro.message}\n`);
    process.exit(1);
  }
})();
