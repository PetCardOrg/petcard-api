# PetCard — Contexto para Claude Code

## Projeto

PetCard — carteira digital de saúde para pets. TCC do Ricardo Temporal.
Multirepo sob `PetCardOrg`:

- `petcard-api` (NestJS 11 + Prisma 6 + Postgres + Redis + RabbitMQ + S3)
- `petcard-mobile` (React Native + Expo, `expo-auth-session` PKCE)
- `petcard-web` (Vite + React 19 — esqueleto, sem router/UI ainda)
- `petcard-shared` (npm `@petcardorg/shared@0.5.0` no GitHub Packages)
- `petcard-docs` (ADRs em `architecture/adr/`, board centralizado)

Equipe: Álvaro Araújo (Backend Lead), Camila Martins (DevOps/PM), Ricardo Temporal (Frontend Lead).

## Stack (api)

- NestJS 11, `@nestjs/passport` + `passport-jwt` + `jwks-rsa`
- Prisma 6.19, Postgres via imagem `postgis/postgis:16-3.4` (PostGIS já provisionado para M3)
- AWS SDK v3 (`@aws-sdk/client-s3`, `s3-request-presigner`)
- `qrcode@1.5.4` para geração de PNG
- Redis e RabbitMQ no docker-compose, **ainda não consumidos por código**
- Jest unitário + e2e (`test/jest-e2e.json`)
- `@petcardorg/shared@^0.5.0`

## Auth

- Auth0 (`AUTH0_DOMAIN`, `AUTH0_AUDIENCE`)
- Roles: `TUTOR` (mobile), `VET` (web)
- Decorators: `@Auth(Role)`, `@Roles(...)`, `@CurrentUser()`
- Guards: `JwtAuthGuard`, `RolesGuard`
- **Auth é opt-in** (não há `APP_GUARD` global). Rota sem `@Auth` é pública por design — cuidar ao criar endpoints
- Mobile: `expo-auth-session` com PKCE (não `react-native-auth0`)
- `RolesGuard` consulta o role no banco (não confia só no token)

## Status das milestones

- **M0** ✅ Setup e Fundações (multirepo, GitHub Packages, ADR-001)
- **M1** ✅ Auth + CRUDs (Tutor, Pet, Vaccine, Deworming, Medication), upload S3, seed
- **M2** 🚧 Carteira Digital + QR Code — em andamento (3/10 issues fechadas + 2 fechadas no shared, 5 abertas)
- **M3** 📋 Geolocalização + Clínicas — backlog detalhado, não iniciado

## M2 — Carteira Digital + QR Code

**Objetivo:** pet ganha uma carteira digital com QR Code que aponta para uma rota pública (sem auth) com o histórico de saúde — útil quando o pet é encontrado perdido ou em consulta com VET sem cadastro.

### Issues

| Código | Repo   | #   | Título                               | Status real               | Evidência                                                             |
| ------ | ------ | --- | ------------------------------------ | ------------------------- | --------------------------------------------------------------------- |
| PC-047 | api    | #18 | Geração QR (UUID + token)            | ✅ Done                   | PR #53; `card.service.generateQrCode`                                 |
| PC-048 | api    | #19 | Upload QR para S3                    | ✅ Done                   | PR #54; `upload.service.uploadBuffer`; key `qr-codes/{petId}.png`     |
| PC-054 | api    | #22 | Migration `carteira_digital`         | ✅ Done                   | PR #55; migration `20260426204420`                                    |
| PC-055 | shared | #6  | DTOs CarteiraDigital                 | ✅ Done                   | PR #23; em `@petcardorg/shared@0.4.0`                                 |
| PC-056 | shared | #7  | Publicar shared com DTOs             | ✅ Done (0.5.0 publicado) |
| PC-049 | api    | #20 | Rota pública `GET /cards/:token`     | ✅ Done                   | rota + service + specs + e2e prontos; aguarda PR                      |
| PC-050 | api    | #21 | Worker RabbitMQ — geração assíncrona | ✅ Done                   | RabbitMQ no compose, sem código; `bullmq`/`amqplib` ausentes          |
| PC-051 | mobile | #13 | Tela carteira digital + QR           | 📋 To Do                  | sem `Carteira/Wallet/QRCode` screens; mobile ainda em shared `^0.2.1` |
| PC-052 | mobile | #14 | Compartilhar link da carteira        | 📋 To Do                  | sem `expo-sharing`/`Share.share`                                      |
| PC-053 | web    | #6  | Página pública SPA `/card/:token`    | 📋 To Do                  | repo só tem template Vite + React 19, sem router                      |

### Decisões já tomadas (extraídas do código — não há ADR de M2)

- **Token:** `randomUUID()` opaco, único por pet (`carteira_digital.token UNIQUE`). Renovado a cada `regenerateQrCode`.
- **Conteúdo do QR:** PNG 400×400, errorCorrection `M`, payload **URL navegável** `${CARD_PUBLIC_BASE_URL}/${token}` (default `https://card.petcard.app/{token}`). Configurado via `card.publicBaseUrl` em `src/config/card.config.ts`.
- **Rota pública:** `GET /cards/:token` no `CardController` (path `cards`, plural). Sem guard, **sem rate-limit por enquanto** (a adicionar em PC futuro), sem expiração do token.
- **Resposta pública:** retorna pet completo + `tutor_name` + todos os vacinas/vermifugações/medicações (incluindo `notes` e `veterinarian_name`) ordenados desc por data. Filtro de privacidade pode ser revisitado depois.
- **Bucket S3:** URL pública direta (`https://{bucket}.s3.{region}.amazonaws.com/{key}`) — assume bucket público. `qr-codes/{petId}.png` sobrescreve a cada regeneração.
- **Source of truth do `qr_code_url`:** `carteira_digital.qr_code_url`. Coluna redundante em `pet` removida na migration `20260429171445_drop_pet_qr_code_url`. `pet.service` lê via `include: { carteiraDigital: true }`.
- **Geração:** **síncrona** dentro de `pet.create()` e `pet.regenerateQrCode()`. Falha de S3 não quebra criação (`try/catch` + log + retorna `null`). PC-050 vai mover para fila.
- **PrismaModule é `@Global()`** — qualquer service injeta `PrismaService` sem importar.

### Decisões pendentes (perguntar ao Ricardo antes de codar)

1. Stack do worker PC-050: BullMQ (Redis, já no compose) ou AMQP via `@golevelup/nestjs-rabbitmq`?
2. Web (PC-053): router (react-router vs TanStack), state, UI lib — tudo em aberto.
3. Mobile (PC-051): bumpar shared para `^0.5.0` antes? Lib de QR: `react-native-qrcode-svg`?
4. Rate-limit na rota pública (deferido de PC-049): `@nestjs/throttler` quando?
5. Filtro de privacidade na resposta pública (deferido de PC-049): ocultar `notes`/`veterinarian_name` dos registros médicos?

### O que falta na M2 (ordem sugerida)

1. PC-049: PR e merge na develop (rota pública pronta no working tree).
2. Decidir #1 → implementar PC-050 (mover geração de QR para fila)
3. Bumpar mobile para shared `^0.5.0` → PC-051 → PC-052
4. Decidir #2 → bootstrap do `petcard-web` → PC-053
5. PC-056: só corrigir título da issue (já entregue como 0.5.0)

## M3 — Geolocalização + Clínicas (preview)

PostGIS (`ST_DWithin`), Google Maps API geocoding, filtros de especialidade/avaliação/distância, migration com tipo `GEOGRAPHY`, seed de clínicas com coordenadas reais. Postgres já roda na imagem PostGIS desde M1. **Não codar nada de M3 até M2 fechar.**

## Convenções

- **Branches:** `feature/PC-XXX-descricao-kebab` (padrão visto em PRs mergeados)
- **Commits:** Conventional Commits (`feat(card): ...`, `fix(auth): ...`, `chore(deps): ...`, `test(pet): ...`)
- **PRs:** mergeados via PR (não direto em `develop`); título e branch carregam o `PC-XXX`
- **DTOs compartilhados:** sempre em `@petcardorg/shared`; campos em `snake_case` (`pet_id`, `qr_code_url`); bump minor para nova feature, publicar via CI no GitHub Packages
- **Testes:** unit obrigatório para services novos (`__tests__/<file>.spec.ts` colado ao módulo); e2e obrigatório para endpoints públicos sem auth
- **Migrations:** `prisma migrate dev --name <descricao_snake_case>`; nome inclui timestamp gerado pelo Prisma
- **ADRs:** decisões arquiteturais relevantes vão em `petcard-docs/architecture/adr/` antes de codar (hoje só ADR-001 existe — multirepo)

## Princípios de trabalho

- **YAGNI.** Não introduzir filas, caches ou abstrações sem demanda da issue.
- **Reutilizar antes de criar.** Procurar equivalente em `petcard-api` e `@petcardorg/shared` antes de novo código.
- **Investigar antes de codar.** Sempre ler o módulo existente antes de propor arquitetura — em especial `card.service`, `pet.service`, `upload.service`.
- **Falha de serviço externo (S3) não quebra fluxo crítico** — degradar com graça, logar via `Logger`.
- **Rotas públicas (sem auth) são superfície de risco** — validar token, retornar apenas o necessário, considerar rate-limit.
- **Atualizar `@petcardorg/shared` exige bump de versão e publish via CI** — depois bumpar consumidores (api/mobile/web).

## Escopo fora de M2 (não fazer agora)

- Issues de M3 (PostGIS, Google Maps, clínicas)
- Refactors amplos não relacionados à carteira digital
- Substituir libs já estabelecidas (Prisma, NestJS, AWS SDK v3)

## Ambiente de desenvolvimento

- Codespace do `petcard-api` com `petcard-shared` e `petcard-mobile` clonados em `/workspaces/`
- `petcard-web` e `petcard-docs` **não** clonados — usar `gh` CLI ou clonar sob demanda
- Docker Compose em `docker/docker-compose.yml`: postgres (PostGIS), redis, rabbitmq (com management UI em :15672)
- Mobile precisa `NODE_AUTH_TOKEN=$GITHUB_TOKEN` para resolver `@petcardorg/shared` no install
- Setup local Windows também documentado em outra parte; Postgres 17 nativo precisa ficar parado para Docker usar a 5432

## Comandos úteis

```bash
# API
docker compose -f docker/docker-compose.yml up -d
npm run start:dev
npx prisma studio
npx prisma migrate dev
npm run db:seed
npm test
npm run test:e2e

# Listar M2 em todos os repos (label não existe — usar milestone)
for r in petcard-api petcard-mobile petcard-web petcard-shared petcard-docs; do
  gh issue list --repo PetCardOrg/$r --milestone "M2 - Carteira Digital + QR Code" --state all
done

# Sincronizar todos os repos clonados
for r in petcard-api petcard-mobile petcard-shared; do
  git -C /workspaces/$r fetch --all --prune
done
```

## Referências rápidas

- Arquivos centrais de M2:
  - `prisma/schema.prisma` — modelos `Pet`, `CarteiraDigital`
  - `src/modules/card/card.service.ts` — `generateQrCode`, `issueTokenForPet`, `setCardQrCodeUrl`, `findPublicByToken`
  - `src/modules/card/card.controller.ts` — `GET /cards/qr-code` (auth) e `GET /cards/:token` (público, em diff)
  - `src/modules/pet/pet.service.ts:178` — `generateAndUploadQrCode`
  - `src/modules/upload/upload.service.ts` — `uploadBuffer` (in-memory PNG)
- ADRs: `gh api repos/PetCardOrg/petcard-docs/contents/architecture/adr` (hoje só `001-multirepo-strategy.md`)

## Última atualização

2026-04-29 — atualizado por Claude Code: redundância `pet.qr_code_url` resolvida (PR mergeado), decisões de PC-049 fechadas (URL no QR; sem rate-limit por agora; resposta pública sem filtro de privacidade)
