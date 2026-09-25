'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// A base de teste fica em pasta temporária: os testes nunca tocam os dados reais.
const temporaria = fs.mkdtempSync(path.join(os.tmpdir(), 'audita-teste-'));
process.env.AUDITA_DADOS = path.join(temporaria, 'dados');
process.env.AUDITA_COMUNICACOES = path.join(temporaria, 'comunicacoes');
process.env.AUDITA_RELATORIOS = path.join(temporaria, 'relatorios');

const ncs = require('../src/ncs');
const comunicacao = require('../src/comunicacao');

const config = {
  slaDias: { 'Crítica': 1, 'Alta': 3, 'Média': 7, 'Baixa': 15 },
  escalonamento: [
    { nivel: 1, papel: 'Responsável técnico', contato: 'responsavel' },
    { nivel: 2, papel: 'Líder técnico', contato: 'lider@empresa.com' },
    { nivel: 3, papel: 'Gerente de Qualidade', contato: 'qa@empresa.com' },
  ],
  equipe: { 'Ana Duarte': 'ana@empresa.com' },
  responsavelPadrao: 'Product Owner',
  emailPadrao: 'po@empresa.com',
  copiaSempre: ['qualidade@empresa.com'],
};

const item = {
  itemId: 'IT-05',
  categoria: 'Testabilidade',
  descricao: 'Possui no mínimo 3 critérios de aceitação',
  peso: 3,
  severidade: 'Crítica',
  acaoCorretiva: 'Detalhar os critérios.',
};

function auditoriaFalsa({ conforme }) {
  const verificacao = { ...item, conforme, evidencia: conforme ? '3 critérios encontrados' : '1 critério encontrado' };
  return {
    checklist: { id: 'CHK-TESTE' },
    artefatos: [{ artefato: 'HU-900', responsavel: 'Ana Duarte', verificacoes: [verificacao] }],
    naoConformidades: conforme ? [] : [{ artefato: 'HU-900', responsavel: 'Ana Duarte', ...verificacao }],
  };
}

const emDias = (n) => {
  const d = new Date('2026-03-01T09:00:00.000Z');
  d.setDate(d.getDate() + n);
  return d.toISOString();
};

test.beforeEach(() => ncs.resetar());

test('item não-conforme abre NC com prazo de acordo com a severidade', async () => {
  const r = await ncs.sincronizar(auditoriaFalsa({ conforme: false }), config, emDias(0));
  assert.equal(r.abertas.length, 1);
  const nc = r.abertas[0];
  assert.equal(nc.id, 'NC-0001');
  assert.equal(nc.status, 'Aberta');
  assert.equal(nc.responsavel, 'Ana Duarte');
  assert.equal(nc.nivelEscalonamento, 1);
  assert.equal(new Date(nc.prazo).toISOString(), emDias(1)); // Crítica = 1 dia
});

test('a abertura da NC gera comunicação para o responsável e para a cópia fixa', async () => {
  await ncs.sincronizar(auditoriaFalsa({ conforme: false }), config, emDias(0));
  const log = comunicacao.lerLog();
  assert.equal(log.length, 1);
  assert.equal(log[0].tipo, 'abertura-nc');
  assert.deepEqual(log[0].para, ['ana@empresa.com', 'qualidade@empresa.com']);
});

test('reauditoria com o item ainda não-conforme não duplica a NC', async () => {
  await ncs.sincronizar(auditoriaFalsa({ conforme: false }), config, emDias(0));
  const segunda = await ncs.sincronizar(auditoriaFalsa({ conforme: false }), config, emDias(1));
  assert.equal(segunda.abertas.length, 0);
  assert.equal(segunda.mantidas.length, 1);
  assert.equal(ncs.listar().length, 1);
});

test('correção do artefato encerra a NC com evidência e tempo de resolução', async () => {
  await ncs.sincronizar(auditoriaFalsa({ conforme: false }), config, emDias(0));
  const r = await ncs.sincronizar(auditoriaFalsa({ conforme: true }), config, emDias(4));
  assert.equal(r.encerradas.length, 1);
  const nc = r.encerradas[0];
  assert.equal(nc.status, 'Fechada');
  assert.equal(nc.diasAteResolucao, 4);
  assert.match(nc.evidenciaCorrecao, /3 critérios/);
  assert.ok(nc.historico.some((h) => h.evento === 'Verificada e fechada'));
  assert.ok(comunicacao.lerLog().some((c) => c.tipo === 'encerramento-nc'));
});

test('prazo vencido escalona um nível por verificação, até o nível máximo', async () => {
  await ncs.sincronizar(auditoriaFalsa({ conforme: false }), config, emDias(0));

  const nenhuma = await ncs.verificarPrazos(config, emDias(0));
  assert.equal(nenhuma.length, 0, 'não deve escalonar antes do vencimento');

  const primeira = await ncs.verificarPrazos(config, emDias(2));
  assert.equal(primeira[0].nivelEscalonamento, 2);

  const segunda = await ncs.verificarPrazos(config, emDias(5));
  assert.equal(segunda[0].nivelEscalonamento, 3);

  const terceira = await ncs.verificarPrazos(config, emDias(20));
  assert.equal(terceira.length, 0, 'não existe nível acima do último da matriz');
  assert.ok(ncs.listar()[0].historico.some((h) => h.evento === 'Nível máximo atingido'));
});

test('a comunicação de escalonamento inclui a instância acionada', async () => {
  await ncs.sincronizar(auditoriaFalsa({ conforme: false }), config, emDias(0));
  await ncs.verificarPrazos(config, emDias(2));
  const escalonamento = comunicacao.lerLog().find((c) => c.tipo === 'escalonamento');
  assert.ok(escalonamento);
  assert.ok(escalonamento.para.includes('lider@empresa.com'));
});

test('a mesma falha após o encerramento reabre a NC como reincidência no nível 2', async () => {
  await ncs.sincronizar(auditoriaFalsa({ conforme: false }), config, emDias(0));
  await ncs.sincronizar(auditoriaFalsa({ conforme: true }), config, emDias(1));
  const r = await ncs.sincronizar(auditoriaFalsa({ conforme: false }), config, emDias(2));

  assert.equal(r.abertas.length, 1);
  assert.equal(r.abertas[0].reincidencias, 1);
  assert.equal(r.abertas[0].nivelEscalonamento, 2);
  assert.equal(ncs.indicadores(emDias(2)).reincidentes, 1);
});

test('assumir a correção muda o status e registra quem assumiu', async () => {
  await ncs.sincronizar(auditoriaFalsa({ conforme: false }), config, emDias(0));
  const nc = ncs.assumir('NC-0001', 'Bruno Lima', emDias(0));
  assert.equal(nc.status, 'Em correção');
  assert.equal(nc.responsavel, 'Bruno Lima');
  assert.throws(() => ncs.comentar('NC-0001', '   '), /comentário/i);
});

test('o histórico usa a data da operação, inclusive com calendário simulado', async () => {
  await ncs.sincronizar(auditoriaFalsa({ conforme: false }), config, emDias(10));
  const nc = ncs.listar()[0];
  assert.equal(new Date(nc.historico[0].em).toISOString(), emDias(10));
});

test('indicadores refletem pendências, vencimentos e tempo médio', async () => {
  await ncs.sincronizar(auditoriaFalsa({ conforme: false }), config, emDias(0));
  const antes = ncs.indicadores(emDias(3));
  assert.equal(antes.pendentes, 1);
  assert.equal(antes.vencidas, 1);

  await ncs.sincronizar(auditoriaFalsa({ conforme: true }), config, emDias(3));
  const depois = ncs.indicadores(emDias(3));
  assert.equal(depois.pendentes, 0);
  assert.equal(depois.fechadas, 1);
  assert.equal(depois.tempoMedioResolucao, 3);
});

test.after(() => fs.rmSync(temporaria, { recursive: true, force: true }));
