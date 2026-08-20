# petcard-api — Contexto para Claude Code

> **Plano de orquestração da M7 (cross-repo, ordem das issues, fases) vive na raiz: `../CLAUDE.md`.**
> Este arquivo cobre só as **convenções da API**. A M7 está em curso — ver a raiz para o que fazer a seguir.

## O que é

Backend do PetCard (carteira digital de saúde para pets). NestJS 11 + Prisma 6 + PostgreSQL 16/PostGIS + RabbitMQ + AWS S3. Serve web (vet) e mobile (tutor). Roles `TUTOR` e `VET` via JWT próprio.

## Stack

- **NestJS 11 + Prisma 6 + PostgreSQL 16 + PostGIS.** PostGIS instalado mas **sem uso** após o pivô para Google Places (decisão: manter a imagem `postgis/postgis:16-3.4`; trocar exigiria re-testar migrations+CI).
- **RabbitMQ** — filas com DLX/DLQ + retry (padrão `qr-code.generate`, `notification.push`).
- **Redis** provisionado no compose, **não consumido em código** — "capacidade reservada" (decisão de narrativa da defesa).
- **AWS S3** para mídia.
- **Auth:** JWT próprio (HS256 + bcrypt), roles `TUTOR`/`VET` no claim `role`, logins separados (`login` / `loginVeterinario`) e cadastro de vet público em `POST /auth/veterinario/register`, que valida o CRMV na criação (api#124). **Auth0 abandonado (M0-#7) — não reintroduzir.** Sem refresh token.
- **DTOs:** `@petcardorg/shared@0.11.0` (GitHub Packages). Resolver exige `NODE_AUTH_TOKEN` (PAT com `read:packages`). DTOs locais duplicados foram removidos — não reintroduzir.
- **Swagger/OpenAPI:** plugin `@nestjs/swagger` em `nest-cli.json`; UI em **`GET /docs`**. Documento gerado por `npm run openapi:json` (preview mode, sem subir infra).

## Padrões da API

- **Investigar antes de codar.** Ler o módulo/serviço alvo e seus testes vizinhos antes de escrever.
- **DTOs no shared.** Toda request/response nova vai como DTO no `@petcardorg/shared` (bump minor + publish). Respostas tipadas explícitas — o CLI plugin do Swagger **não** infere tipos de pacote externo.
- **Auth.** `@Auth()` + `@Roles(Role.VET)`/`Role.TUTOR`; usuário via `@CurrentUser()`. **Nunca ler o claim JWT direto no controller.**
- **Filas.** Toda fila nova precisa de DLX/DLQ + retry.
- **Migrations.** `npx prisma migrate dev --name <descricao_snake_case>`. SQL fora do Prisma: `--create-only` + edição manual.
- **Configuração.** Variáveis sensíveis em `.env` com entrada no `.env.example`. Sem fallback hardcoded; em produção, faltar variável crítica = falha rápida no boot. API obriga `CORS_ORIGINS` em produção.
- **Commits/branches/PRs:** ver as regras cross-repo na raiz (`../CLAUDE.md`). PR mira `develop`.

## Testes & cobertura

- **Cobertura de confiança, não percentual (ADR-006).** Antes de escrever um `it()`: _se quebrar, uma regra de negócio quebrou ou o usuário foi impactado?_ Se não, não escrever. Nada de teste para wrapper, controller que só delega, getter/setter.
- Unit para lógica de negócio (mock de Prisma + externos), integração para contrato de rota/guard/validação (supertest), **E2E só para fluxo vital** — erro secundário e caminho alternativo descem para integração.
- **Catraca de cobertura: 83/78/90/85 — freio de regressão, não meta.** Não abaixar sem ADR; também não inventar teste para subir.
- ✅ **Flakiness da api#107 resolvida** (2026-08-17). A causa era `jest.mock('bcrypt', factory, { virtual: true })`: a flag declara que o módulo não existe em disco, mas bcrypt existe, e o Jest às vezes resolvia o módulo real pelo cache de transform — o hash verdadeiro não batia com a fixture e o login falhava. **Não usar `virtual: true` para mockar módulo que existe.**

## Gotchas

- **CLI plugin do Swagger só instrumenta no build real** (`nest build`/`nest start`), **não sob `ts-node`** — DTOs locais ficam com schema vazio se gerados via ts-node. Por isso `openapi:json` = `nest build && node dist/scripts/generate-openapi.js`.
- **`preview mode`** (`NestFactory.create(AppModule, { preview: true })`) monta o grafo de módulos e lê metadados sem instanciar providers nem rodar `onModuleInit` — gera o OpenAPI sem conectar Postgres/RabbitMQ.
- Ao adicionar bloco `permissions:` num workflow, tudo não-listado vira `none` — incluir `packages: read`, senão `npm ci` falha (403) ao baixar `@petcardorg/shared`.
- **O publish do `@petcardorg/shared` roda só em push para `main`** daquele repo. Bumpar a versão no `develop` não publica nada, e o `npm ci` da api quebra com `ETARGET`. O shared é o único repo cuja `main` acompanha o `develop` — o hold de `develop → main` vale para api, web, mobile e docs.
- **Consulta de CRMV é paga por chamada.** O `test/e2e/setup-env.ts` fixa `CRMV_PROVIDER=stub` por atribuição direta, justamente para um `.env` de desenvolvimento apontando para o provedor real não fazer o e2e gastar dinheiro. Não trocar para `??=`.

## Ambiente & comandos

```bash
docker compose -f docker/docker-compose.yml up -d   # postgis + redis + rabbitmq locais
npm run start:dev              # API :3000, Swagger UI em /docs
npm test                       # unit (jest, *.spec.ts)
npm run test:cov               # cobertura (verifica a catraca 84/80/93/85)
npm run test:e2e               # E2E — precisa de Postgres
npm run openapi:json           # gera openapi.json (preview mode)
npm run db:seed                # contas do seed (senha petcard123)
```
