#!/usr/bin/env bash
# Deixa o ambiente limpo para gravar a demonstração ou entregar o trabalho:
# zera a base de NCs, o histórico e o log de comunicações, e apaga os arquivos
# gerados pelas execuções anteriores (mensagens e relatórios HTML).
#
#   bash preparar.sh
#
# Depois disso, `node audita.js auditar` roda como se fosse a primeira vez.
set -euo pipefail

cd "$(dirname "$0")"

echo "Zerando NCs, histórico e log de comunicações..."
node audita.js resetar --confirmar

echo "Removendo arquivos gerados..."
rm -rf comunicacoes relatorios

echo "Ambiente limpo."
