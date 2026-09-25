'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { calcularAderencia, classificar, agregarPorCategoria, validarConfiguracao, executarAuditoria } = require('../src/auditoria');

const checklist = {
  classificacao: [
    { min: 90, resultado: 'Aprovado' },
    { min: 70, resultado: 'Aprovado com ressalvas' },
    { min: 0, resultado: 'Reprovado' },
  ],
  itens: [
    { id: 'IT-01', categoria: 'A', regra: 'titulo', peso: 1, severidade: 'Baixa', acaoCorretiva: 'x' },
    { id: 'IT-02', categoria: 'B', regra: 'narrativa', peso: 3, severidade: 'Crítica', acaoCorretiva: 'x' },
  ],
};

const config = {
  slaDias: { 'Crítica': 1, 'Alta': 3, 'Média': 7, 'Baixa': 15 },
  escalonamento: [{ nivel: 1, papel: 'a', contato: 'a' }, { nivel: 2, papel: 'b', contato: 'b' }],
};

test('aderência pondera pelos pesos, e não pela contagem de itens', () => {
  const r = calcularAderencia([
    { peso: 3, conforme: true },
    { peso: 1, conforme: false },
  ]);
  assert.deepEqual(r, { total: 4, obtido: 3, percentual: 75 });
});

test('checklist totalmente conforme e totalmente não-conforme', () => {
  assert.equal(calcularAderencia([{ peso: 2, conforme: true }]).percentual, 100);
  assert.equal(calcularAderencia([{ peso: 2, conforme: false }]).percentual, 0);
});

test('lista vazia não quebra o cálculo', () => {
  assert.equal(calcularAderencia([]).percentual, 0);
});

test('classificação respeita os limites das faixas', () => {
  assert.equal(classificar(checklist, 90), 'Aprovado');
  assert.equal(classificar(checklist, 89.9), 'Aprovado com ressalvas');
  assert.equal(classificar(checklist, 70), 'Aprovado com ressalvas');
  assert.equal(classificar(checklist, 69.9), 'Reprovado');
  assert.equal(classificar(checklist, 0), 'Reprovado');
});

test('agregação por categoria soma pesos e conta itens não-conformes', () => {
  const r = agregarPorCategoria([
    { categoria: 'Testabilidade', peso: 3, conforme: false },
    { categoria: 'Testabilidade', peso: 1, conforme: true },
    { categoria: 'Planejamento', peso: 2, conforme: true },
  ]);
  const testabilidade = r.find((c) => c.categoria === 'Testabilidade');
  assert.equal(testabilidade.percentual, 25);
  assert.equal(testabilidade.naoConformes, 1);
  assert.equal(r.find((c) => c.categoria === 'Planejamento').percentual, 100);
});

test('configuração válida não levanta erro', () => {
  assert.doesNotThrow(() => validarConfiguracao(checklist, config));
});

test('regra inexistente no checklist é recusada com mensagem clara', () => {
  const invalido = { ...checklist, itens: [{ ...checklist.itens[0], regra: 'naoExiste' }] };
  assert.throws(() => validarConfiguracao(invalido, config), /naoExiste/);
});

test('severidade sem SLA cadastrado é recusada', () => {
  const invalido = { ...checklist, itens: [{ ...checklist.itens[0], severidade: 'Urgentíssima' }] };
  assert.throws(() => validarConfiguracao(invalido, config), /SLA/);
});

test('item com id duplicado é recusado', () => {
  const invalido = { ...checklist, itens: [checklist.itens[0], checklist.itens[0]] };
  assert.throws(() => validarConfiguracao(invalido, config), /duplicado/);
});

test('auditoria real dos artefatos é coerente consigo mesma', () => {
  const a = executarAuditoria();

  assert.ok(a.resumo.artefatosAuditados > 0);
  assert.equal(a.resumo.itensVerificados, a.resumo.artefatosAuditados * a.artefatos[0].verificacoes.length);

  // O total global é a soma dos artefatos, e não uma média das porcentagens.
  const somaPossivel = a.artefatos.reduce((s, x) => s + x.total, 0);
  const somaObtida = a.artefatos.reduce((s, x) => s + x.obtido, 0);
  assert.equal(a.resumo.pontosPossiveis, somaPossivel);
  assert.equal(a.resumo.pontosObtidos, somaObtida);
  assert.equal(a.resumo.aderencia, Number(((somaObtida / somaPossivel) * 100).toFixed(1)));

  // Uma NC para cada item reprovado, sem sobra nem falta.
  const reprovados = a.artefatos.flatMap((x) => x.verificacoes.filter((v) => !v.conforme));
  assert.equal(a.resumo.naoConformidades, reprovados.length);
  assert.equal(Object.values(a.resumo.porSeveridade).reduce((s, n) => s + n, 0), reprovados.length);

  // Toda NC carrega evidência e ação corretiva — é o que a comunicação precisa.
  for (const nc of a.naoConformidades) {
    assert.ok(nc.evidencia && nc.evidencia.length > 0, `NC de ${nc.artefato}/${nc.itemId} sem evidência`);
    assert.ok(nc.acaoCorretiva && nc.acaoCorretiva.length > 0);
  }
});

test('o artefato de referência HU-001 permanece 100% conforme', () => {
  const hu001 = executarAuditoria().artefatos.find((x) => x.artefato === 'HU-001');
  assert.equal(hu001.percentual, 100);
  assert.equal(hu001.resultado, 'Aprovado');
});
