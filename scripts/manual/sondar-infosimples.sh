#!/usr/bin/env bash
# Descobre o contrato real da consulta CFMV da Infosimples.
# NÃO imprime o token. Gasta 1 consulta (~R$ 0,20) por tentativa bem-sucedida.
#
# Uso:  INFOSIMPLES_TOKEN=xxx bash sondar-infosimples.sh 12345 SP
set -uo pipefail

CRMV="${1:-12345}"
UF="${2:-SP}"
TOKEN="${INFOSIMPLES_TOKEN:-}"

[ -z "$TOKEN" ] && { echo "!! Defina INFOSIMPLES_TOKEN antes de rodar."; exit 1; }

# Candidatos de endpoint — o primeiro é o que a api usa hoje.
URLS=(
  "https://api.infosimples.com/api/v2/consultas/cfmv/cadastro"
  "https://api.infosimples.com/api/v2/consultas/cfmv-cadastro"
)

for URL in "${URLS[@]}"; do
  echo "== $URL"
  RESP=$(curl -s -G "$URL" \
    --data-urlencode "token=$TOKEN" \
    --data-urlencode "query=$CRMV" \
    --data-urlencode "uf=$UF" \
    --data-urlencode "timeout=15" \
    -w '\n__HTTP__%{http_code}')

  CODE=$(echo "$RESP" | tail -1 | sed 's/__HTTP__//')
  BODY=$(echo "$RESP" | sed '$d')
  echo "   HTTP $CODE"

  python3 - "$BODY" <<'PY'
import json, sys
try:
    d = json.loads(sys.argv[1])
except Exception:
    print("   resposta não-JSON:", sys.argv[1][:300]); raise SystemExit
print("   campos na raiz :", list(d.keys()))
print("   code           :", d.get("code"), "|", d.get("code_message"))
if d.get("errors"):
    print("   errors         :", d["errors"])
data = d.get("data") or []
print("   itens em data  :", len(data))
if data:
    print("   campos do item :", list(data[0].keys()))
    for k in ("nome", "crmv", "situacao", "inscricao", "uf", "tipo_inscricao"):
        if k in data[0]:
            print(f"     {k:15}: {data[0][k]}")
PY
  echo
  # Achou o endpoint certo? para de tentar.
  echo "$BODY" | grep -q '"code":600' && { echo ">> Este endpoint respondeu 600 (sucesso). Use-o."; break; }
done
