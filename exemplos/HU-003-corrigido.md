# HU-003 — Consultar relatório de progresso da turma

**ID:** HU-003
**Épico:** Acompanhamento pedagógico
**Responsável:** Carla Menezes
**Prioridade:** Alta
**Estimativa:** 5
**Requisito:** RF-033
**Dependências:** Nenhuma

## Narrativa
Como tutor responsável por uma turma,
Quero consultar o relatório de progresso dos alunos da minha turma,
Para que eu possa identificar quem está atrasado e intervir antes do fim do módulo.

## Critérios de aceitação
- Dado que o tutor está vinculado à turma, Quando abre o relatório de progresso, Então vê a lista de alunos com percentual de conclusão, nota média e data do último acesso.
- Dado que o relatório possui até 500 alunos, Quando o tutor solicita a consulta, Então o resultado é apresentado em no máximo 2 segundos.
- Dado que o tutor não está vinculado à turma, Quando tenta abrir o relatório, Então o sistema bloqueia o acesso e registra a tentativa no log de auditoria.
- Dado que nenhum aluno iniciou o curso, Quando o tutor abre o relatório, Então o sistema exibe o estado vazio com orientação para enviar convite à turma.

## Regras de negócio
- RN-01 Somente tutores vinculados à turma acessam o relatório.
- RN-02 O percentual de conclusão considera apenas as aulas obrigatórias do módulo.
