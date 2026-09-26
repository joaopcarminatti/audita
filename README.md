# Audita — auditoria automatizada de qualidade

> **Sobre o build vermelho na aba Actions.** Os artefatos em `artefatos/` têm defeitos propositais —
> eles existem para a ferramenta ter não-conformidades reais para encontrar. A auditoria roda como
> portão de qualidade (`--exigir-meta`) e reprova o build quando a aderência fica abaixo da meta de
> 90% definida em `config.json`. Ou seja: **a falha do job é o resultado esperado**, é a prova de que
> o portão funciona, e não um erro de execução. O relatório completo fica publicado nos artefatos da
> execução.

Ferramenta desenvolvida do zero (Node.js puro, sem bibliotecas externas e sem planilha) para auditar
artefatos de um processo de software, calcular o percentual de aderência a um checklist, registrar as
não-conformidades (NC), acompanhá-las até o encerramento, escalonar prazos vencidos e comunicar os
responsáveis.

**Artefato auditado:** História de Usuário do backlog (arquivos Markdown em `artefatos/`).
**Checklist:** Definition of Ready com 13 itens, pesos e severidades (`checklists/hu-dor.json`).

## Atendimento aos requisitos do trabalho

| Requisito | Onde está implementado |
|---|---|
| Auditoria automatizada | `src/regras.js` verifica cada item lendo o artefato; nenhuma resposta é digitada pelo auditor. `node audita.js vigiar` reaudita sozinha a cada arquivo salvo |
| Criação do checklist | `checklists/hu-dor.json` — item, categoria, peso, severidade e ação corretiva |
| Cálculo de % de aderência | `src/auditoria.js`: pontos conformes ÷ pontos possíveis × 100, por artefato, por categoria e global, com meta e classificação |
| Registro de NC | `src/ncs.js` grava cada NC em `dados/nao-conformidades.json` com evidência, severidade, responsável, prazo e histórico |
| Acompanhamento até a resolução | Ciclo Aberta → Em correção → Resolvida → Fechada; a reauditoria verifica a correção e encerra a NC automaticamente |
| Escalonamento | Matriz de 4 níveis em `config.json`; prazo vencido sobe o nível e redefine o SLA; reincidência abre direto no nível 2 |
| Comunicação de NC | `src/comunicacao.js` gera as mensagens em `comunicacoes/`, registra o log e envia para webhook se `WEBHOOK_URL` estiver definida |
| Painel e relatório | `node audita.js painel` e relatório HTML em `relatorios/` |

## Como executar

Pré-requisito: Node.js 18 ou superior. Não há dependências para instalar.

```bash
node audita.js auditar      # auditoria completa
node audita.js painel       # painel em http://localhost:3000
node audita.js vigiar       # reaudita a cada artefato salvo
node audita.js ncs          # NCs e indicadores
npm test                    # testes automatizados da ferramenta
node audita.js ajuda        # todos os comandos
```

## Como funciona

**Aderência.** Cada item do checklist tem um peso de 1 a 3. A aderência de um artefato é a soma dos pesos
dos itens conformes dividida pela soma dos pesos aplicáveis. Classificação: 90% ou mais aprovado; 70% a
89,9% aprovado com ressalvas; abaixo de 70% reprovado. A meta do projeto fica em `config.json`
(`metaAderencia`) e pode ser usada como portão de build com `--exigir-meta`.

**Não-conformidade.** Todo item reprovado vira uma NC com identificador próprio, evidência extraída do
artefato, severidade herdada do checklist e prazo calculado pelo SLA da severidade
(Crítica 1 dia, Alta 3, Média 7, Baixa 15). Cada evento fica no histórico datado da NC.

**Encerramento.** Na execução seguinte, a ferramenta reavalia o item: se estiver conforme, a NC é marcada
como resolvida, verificada automaticamente, fechada e comunicada. Se o artefato ou o item sair do escopo,
a NC não é encerrada sem evidência — fica pendente e sinalizada.

**Escalonamento.** N1 responsável técnico → N2 líder técnico → N3 gerência de qualidade → N4 comitê da
qualidade. A cada vencimento de prazo a NC sobe um nível, ganha novo prazo e a comunicação passa a incluir
a instância acionada. A mesma falha reaberta depois de encerrada entra como reincidência já no nível 2.

**Comunicação.** Cada evento (abertura, escalonamento, encerramento e fechamento da auditoria) gera uma
mensagem HTML em `comunicacoes/`, com destinatários calculados pelo nível de escalonamento, e um registro
no log exibido no painel. Definindo `WEBHOOK_URL`, a mesma mensagem vai para o canal do time (Slack,
Discord, Teams); se o canal estiver fora do ar, a auditoria continua e o erro fica documentado no log.

**Evolução.** Cada execução é registrada em `dados/historico-auditorias.json`, o que permite mostrar no
painel e no relatório se a qualidade do backlog está subindo ou caindo entre as auditorias.

## Qualidade da própria ferramenta

- `npm test` roda 34 testes automatizados (`node:test`, sem dependências) cobrindo as regras do checklist,
  o cálculo de aderência e as faixas de classificação, o ciclo de vida da NC, o escalonamento por prazo,
  a reincidência e as comunicações geradas. Os testes rodam em pasta temporária e não tocam a base real.
- A ferramenta valida a própria configuração antes de auditar: regra inexistente, peso inválido,
  item duplicado ou severidade sem SLA viram mensagem de erro clara em vez de resultado silenciosamente errado.
- `.github/workflows/auditoria.yml` mostra a ferramenta rodando como portão de qualidade em uma esteira
  de CI, publicando o relatório como artefato do build.

## Roteiro do vídeo (3 minutos)

Antes de gravar: `node audita.js resetar --confirmar`. Cada integrante entra duas vezes, para que os três
apareçam e falem.

| Tempo | Quem | O que mostrar |
|---|---|---|
| 0:00–0:25 | Felipe Braga | Apresenta o time, o problema (auditoria manual em planilha) e o artefato escolhido; abre `checklists/hu-dor.json` mostrando itens, pesos e severidades |
| 0:25–1:05 | Gustavo Nery | Roda `node audita.js auditar`: aderência por artefato, aderência global de 71,8% contra a meta de 90%, categoria mais frágil e 17 NCs com prazo e responsável |
| 1:05–1:45 | João Pedro Carminatti | Abre o painel, expande uma NC crítica mostrando evidência, ação corretiva e histórico, e abre uma das mensagens de comunicação |
| 1:45–2:15 | Felipe Braga | Com o calendário simulado em +5 dias, clica em "Verificar prazos": as NCs vencidas sobem para N2 e a comunicação passa a incluir o líder técnico |
| 2:15–2:50 | Gustavo Nery | Corrige a HU-003 (`node audita.js corrigir HU-003`) e reaudita: as 5 NCs são encerradas automaticamente e a aderência sobe para 80,9%, com o gráfico de evolução no painel |
| 2:50–3:00 | João Pedro Carminatti (com os três em tela) | Fecha com o relatório HTML aberto e a conclusão |

Alternativa mais fluida para a parte final: deixar `node audita.js vigiar` rodando e salvar a correção do
artefato na frente da câmera — a reauditoria dispara sozinha e as NCs se encerram na tela.

## Estrutura

```
audita.js              interface de linha de comando
config.json            projeto, meta, equipe, SLA por severidade e matriz de escalonamento
checklists/            checklist auditado (itens, pesos, severidades, ações corretivas)
artefatos/             histórias de usuário auditadas
exemplos/              versão corrigida usada na demonstração
testes/                testes automatizados (npm test)
src/parser.js          leitura do artefato
src/regras.js          verificação automática de cada item
src/auditoria.js       execução da auditoria, cálculo da aderência e validação da configuração
src/ncs.js             registro, acompanhamento, resolução e escalonamento
src/comunicacao.js     geração e envio das comunicações
src/historico.js       evolução da aderência entre auditorias
src/ciclo.js           ciclo completo compartilhado entre CLI e painel
src/relatorio.js       relatório HTML
src/servidor.js        painel web e API
src/caminhos.js        caminhos e leitura tolerante de JSON
dados/                 base de NCs, histórico e log de comunicações (gerados)
```
