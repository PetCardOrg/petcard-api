#!/usr/bin/env bash
# Roteiro de teste manual da api#113 — QR clínico para veterinário verificado.
# Uso:  bash testar-113.sh [porta]      (padrão 3000)
set -uo pipefail

API="http://localhost:${1:-3000}"
VET_EMAIL="camila.ferreira@vet.example.com"
VET_SENHA="petcard123"
PSQL=(docker exec petcard-postgres psql -U petcard -d petcard_dev -tAc)

ok=0; falhou=0
check() { # check "descrição" "esperado" "obtido"
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; ok=$((ok+1))
  else printf '  \033[31m✗\033[0m %s — esperado %s, obteve %s\n' "$1" "$2" "$3"; falhou=$((falhou+1)); fi
}
json() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)" 2>/dev/null; }

echo "== 0. Descobrindo dados de teste =========================="
QR=$("${PSQL[@]}" "select token from carteira_digital limit 1;" | tr -d '[:space:]')
[ -z "$QR" ] && { echo "!! Nenhuma carteira no banco. Crie um pet pelo app antes."; exit 1; }
echo "  token do QR: $QR"

VET_ID=$("${PSQL[@]}" "select id from veterinario where email='$VET_EMAIL';" | tr -d '[:space:]')
[ -z "$VET_ID" ] && { echo "!! Veterinário $VET_EMAIL não existe. Veja a nota sobre o seed."; exit 1; }
CRMV_ORIG=$("${PSQL[@]}" "select crmv from veterinario where id='$VET_ID';" | xargs)
echo "  vet: $VET_EMAIL | CRMV: $CRMV_ORIG"

# Estado limpo: começa não verificado
"${PSQL[@]}" "update veterinario set crmv_verified_at=null, crmv_situacao=null where id='$VET_ID';" >/dev/null

echo
echo "== 1. Login do veterinário ================================="
JWT=$(curl -s -X POST "$API/auth/veterinario/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$VET_EMAIL\",\"password\":\"$VET_SENHA\"}" | json "d['access_token']")
[ -z "$JWT" ] && { echo "!! Login falhou — a API está rodando em $API?"; exit 1; }
check "token obtido" "sim" "sim"

echo
echo "== 2. Estado inicial: CRMV não verificado =================="
V=$(curl -s "$API/veterinarios/me/crmv" -H "Authorization: Bearer $JWT" | json "str(d['verified']).lower()")
check "GET /veterinarios/me/crmv -> verified=false" "false" "$V"

echo
echo "== 3. Carteira clínica bloqueada sem verificação ==========="
C=$(curl -s -o /dev/null -w '%{http_code}' "$API/cards/$QR/clinico" -H "Authorization: Bearer $JWT")
check "GET /cards/:token/clinico -> 403" "403" "$C"

echo
echo "== 4. Verificar o CRMV ====================================="
R=$(curl -s -X POST "$API/veterinarios/me/crmv/verificar" -H "Authorization: Bearer $JWT")
V=$(echo "$R" | json "str(d['verified']).lower()")
check "POST verificar -> verified=true" "true" "$V"
echo "  situação: $(echo "$R" | json "d.get('situacao','-')")"

echo
echo "== 5. Carteira clínica liberada ============================"
curl -s "$API/cards/$QR/clinico" -H "Authorization: Bearer $JWT" -o /tmp/113-clin.json \
  -w '' 2>/dev/null
C=$(curl -s -o /dev/null -w '%{http_code}' "$API/cards/$QR/clinico" -H "Authorization: Bearer $JWT")
check "GET /cards/:token/clinico -> 200" "200" "$C"
TEM_NOTAS=$(python3 -c "import json;d=json.load(open('/tmp/113-clin.json'));print('sim' if 'clinical_notes' in d else 'nao')")
check "resposta traz clinical_notes" "sim" "$TEM_NOTAS"
python3 -c "
import json;d=json.load(open('/tmp/113-clin.json'))
print('  notas clínicas:', len(d.get('clinical_notes',[])))
print('  medicações   :', len(d.get('medications',[])))
print('  acessado por :', d.get('accessed_by_crmv'))
"

echo
echo "== 6. Carteira PÚBLICA continua mínima (sem auth) =========="
curl -s "$API/cards/$QR" -o /tmp/113-pub.json
MEDS=$(python3 -c "import json;print(len(json.load(open('/tmp/113-pub.json'))['medications']))")
NOTAS=$(python3 -c "import json;print('ausente' if 'clinical_notes' not in json.load(open('/tmp/113-pub.json')) else 'VAZOU')")
check "medications vazio" "0" "$MEDS"
check "clinical_notes não exposto" "ausente" "$NOTAS"

echo
echo "== 7. Anônimo não acessa a carteira clínica ================"
C=$(curl -s -o /dev/null -w '%{http_code}' "$API/cards/$QR/clinico")
check "sem Authorization -> 401" "401" "$C"

echo
echo "== 8. Cache: não reconsulta dentro do prazo ================"
ANTES=$("${PSQL[@]}" "select crmv_verified_at from veterinario where id='$VET_ID';" | tr -d '[:space:]')
sleep 1
curl -s -X POST "$API/veterinarios/me/crmv/verificar" -H "Authorization: Bearer $JWT" >/dev/null
DEPOIS=$("${PSQL[@]}" "select crmv_verified_at from veterinario where id='$VET_ID';" | tr -d '[:space:]')
check "verified_at inalterado (usou cache)" "$ANTES" "$DEPOIS"

echo
echo "== 9. force=true reconsulta ================================"
sleep 1
curl -s -X POST "$API/veterinarios/me/crmv/verificar?force=true" -H "Authorization: Bearer $JWT" >/dev/null
FORCED=$("${PSQL[@]}" "select crmv_verified_at from veterinario where id='$VET_ID';" | tr -d '[:space:]')
[ "$FORCED" != "$DEPOIS" ] && check "verified_at atualizado" "mudou" "mudou" || check "verified_at atualizado" "mudou" "igual"

echo
echo "== 10. Verificação vencida volta a bloquear ================"
"${PSQL[@]}" "update veterinario set crmv_verified_at = now() - interval '200 days' where id='$VET_ID';" >/dev/null
V=$(curl -s "$API/veterinarios/me/crmv" -H "Authorization: Bearer $JWT" | json "str(d['verified']).lower()")
check "TTL de 180d expirado -> verified=false" "false" "$V"
C=$(curl -s -o /dev/null -w '%{http_code}' "$API/cards/$QR/clinico" -H "Authorization: Bearer $JWT")
check "carteira clínica -> 403" "403" "$C"

echo
echo "== 11. Caminho da recusa (CRMV inválido) ==================="
"${PSQL[@]}" "update veterinario set crmv='CRMV-SP 00000' where id='$VET_ID';" >/dev/null
V=$(curl -s -X POST "$API/veterinarios/me/crmv/verificar?force=true" -H "Authorization: Bearer $JWT" | json "str(d['verified']).lower()")
check "CRMV recusado -> verified=false" "false" "$V"
C=$(curl -s -o /dev/null -w '%{http_code}' "$API/cards/$QR/clinico" -H "Authorization: Bearer $JWT")
check "carteira clínica -> 403" "403" "$C"

echo
echo "== 12. Restaurando estado original ========================="
"${PSQL[@]}" "update veterinario set crmv='$CRMV_ORIG' where id='$VET_ID';" >/dev/null
curl -s -X POST "$API/veterinarios/me/crmv/verificar?force=true" -H "Authorization: Bearer $JWT" >/dev/null
C=$(curl -s -o /dev/null -w '%{http_code}' "$API/cards/$QR/clinico" -H "Authorization: Bearer $JWT")
check "CRMV restaurado -> 200" "200" "$C"

echo
echo "============================================================"
printf 'Resultado: \033[32m%d passaram\033[0m, \033[31m%d falharam\033[0m\n' "$ok" "$falhou"
[ "$falhou" -eq 0 ] && echo "Todos os pontos da issue #113 conferidos." || echo "Revise os itens marcados com ✗."
exit "$falhou"
