'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { parseArtefato } = require('../src/parser');
const { regras } = require('../src/regras');

const CONFORME = `# HU-100 — Cancelar matrícula

**ID:** HU-100
**Responsável:** Ana Duarte
**Prioridade:** Alta
**Estimativa:** 5
**Requisito:** RF-050
**Dependências:** Nenhuma

## Narrativa
Como aluno matriculado,
Quero cancelar minha matrícula em um curso,
Para que eu possa liberar vaga e parar de receber cobranças.

## Critérios de aceitação
- Dado que o aluno está matriculado, Quando confirma o cancelamento, Então a matrícula fica inativa e a vaga é liberada.
- Dado que o curso já começou há mais de 7 dias, Quando o aluno solicita o cancelamento, Então o sistema informa a política de reembolso parcial.
- Dado que o aluno não está matriculado, Quando acessa a tela, Então o botão de cancelamento não é exibido.

## Regras de negócio
- RN-01 O cancelamento é irreversível após 30 dias.
`;

const artefato = (texto) => parseArtefato(texto, 'HU-100.md');
const trocar = (de, para) => artefato(CONFORME.replace(de, para));

test('artefato completo é aprovado em todas as regras', () => {
  const a = artefato(CONFORME);
  for (const [nome, regra] of Object.entries(regras)) {
    assert.equal(regra(a).conforme, true, `a regra "${nome}" reprovou um artefato conforme`);
  }
});

test('identificador fora do padrão HU-000 é reprovado', () => {
  assert.equal(regras.identificador(trocar('**ID:** HU-100', '**ID:** HU100')).conforme, false);
});

test('narrativa incompleta é reprovada e a evidência aponta o elemento ausente', () => {
  const r = regras.narrativa(trocar('Quero cancelar minha matrícula em um curso,\n', ''));
  assert.equal(r.conforme, false);
  assert.match(r.evidencia, /Quero/);
});

test('papel genérico é reprovado', () => {
  assert.equal(regras.papelEspecifico(trocar('Como aluno matriculado,', 'Como usuário,')).conforme, false);
});

test('menos de três critérios de aceitação é reprovado', () => {
  const semUm = CONFORME.replace(/- Dado que o aluno não está matriculado.*\n/, '');
  assert.equal(regras.quantidadeCriterios(artefato(semUm)).conforme, false);
});

test('critério fora do padrão Dado/Quando/Então é reprovado', () => {
  const r = regras.formatoCriterios(trocar('- Dado que o aluno está matriculado, Quando confirma o cancelamento, Então a matrícula fica inativa e a vaga é liberada.', '- O aluno cancela a matrícula.'));
  assert.equal(r.conforme, false);
});

test('termos ambíguos são detectados em qualquer parte do texto', () => {
  const r = regras.ambiguidade(trocar('a vaga é liberada.', 'a tela responde rápido.'));
  assert.equal(r.conforme, false);
  assert.match(r.evidencia, /rapido/);
});

test('palavra que apenas contém um termo ambíguo não gera falso positivo', () => {
  assert.equal(regras.ambiguidade(trocar('a vaga é liberada.', 'a vaga é liberada simultaneamente.')).conforme, true);
});

test('estimativa fora da escala de Fibonacci é reprovada', () => {
  assert.equal(regras.estimativa(trocar('**Estimativa:** 5', '**Estimativa:** 6')).conforme, false);
  assert.equal(regras.estimativa(trocar('**Estimativa:** 5', '**Estimativa:** 13')).conforme, true);
});

test('campos vazios de prioridade e responsável são reprovados', () => {
  assert.equal(regras.prioridade(trocar('**Prioridade:** Alta', '**Prioridade:**')).conforme, false);
  assert.equal(regras.responsavel(trocar('**Responsável:** Ana Duarte', '**Responsável:**')).conforme, false);
});

test('rastreabilidade exige requisito no padrão RF-000', () => {
  assert.equal(regras.rastreabilidade(trocar('**Requisito:** RF-050', '**Requisito:** a definir')).conforme, false);
});

test('regras de negócio sem numeração RN-00 são reprovadas', () => {
  assert.equal(regras.regrasNegocio(trocar('- RN-01 O cancelamento é irreversível após 30 dias.', '- O cancelamento é irreversível.')).conforme, false);
});

test('campos são lidos mesmo fora do cabeçalho', () => {
  const movido = CONFORME.replace('**Requisito:** RF-050\n', '') + '\n**Requisito:** RF-050\n';
  assert.equal(regras.rastreabilidade(artefato(movido)).conforme, true);
});
