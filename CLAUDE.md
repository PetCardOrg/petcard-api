# PetCard — Contexto para Claude Code (foco: Milestone 6 — Testes + QA)

## Projeto

PetCard — carteira digital de saúde para pets. TCC do Ricardo Temporal.
Multirepo sob `PetCardOrg`:

- `petcard-api` (NestJS + Prisma + Postgres + RabbitMQ + S3) — **maior superfície de teste desta milestone** (services, controllers, fluxos E2E)
- `petcard-web` (SPA Vite + React) — **infra de teste nasce nesta milestone** (hoje sem nenhum teste)
- `petcard-mobile` (React Native + Expo) — **infra de teste nasce nesta milestone** (hoje sem nenhum teste)
- `petcard-shared` (npm `@petcardorg/shared` no GitHub Packages, **`0.9.0`**) — DTOs; sem issue de M6
- `petcard-docs` (ADRs, board centralizado, documentação) — registrar decisões de QA/CI quando houver

**Equipe:** Álvaro Araújo (Backend), Camila Martins (DevOps/PM), Ricardo Temporal (Frontend Lead — atua na API desde M2).

**Contexto de prazo:** a **Parte 1 do TCC já foi apresentada à banca**. A **Parte 2 vai até dezembro/2026** — há folga de tempo. M6 (testes/QA) e M7 (docs/deploy) são o trabalho da Parte 2. Trabalhar com qualidade, sem o regime de "reta final".

## Stack relevante

- **Backend:** NestJS 11, Prisma 6, PostgreSQL 16 + PostGIS (PostGIS instalado mas sem uso após pivô para Google Places), AWS S3, RabbitMQ (filas com DLX/DLQ + retry). Redis provisionado no compose, **não consumido em código**.
- **Web:** Vite + React 19 + TypeScript, `react-router-dom` v7, i18n (pt-BR + en-US). HTTP via `apiFetch` próprio (`src/services/api.ts`). Área autenticada do vet (login, rotas protegidas, sessão) entregue em M5: token em `localStorage` + React Context + `ProtectedRoute`.
- **Mobile:** React Native + Expo + TypeScript.
- **Auth:** JWT próprio (HS256 + bcrypt), roles `TUTOR` e `VET`, discriminadas pelo claim `role` (logins separados `login`/`loginVeterinario`). Auth0 foi abandonado (M0-#7) — **não reintroduzir**. Sem refresh token.
- **Shared:** DTOs em `@petcardorg/shared@0.9.0`. Após M5, api e web consomem os DTOs do vet/nota direto do shared (duplicação local removida). Resolver o pacote exige `NODE_AUTH_TOKEN` (PAT com `read:packages`).

## Status das milestones

- **M0** ✅ Setup, GitHub Packages, ADR-001 multirepo, project board, ferramental (ESLint/Prettier/Husky/CI) nos 5 repos
- **M1** ✅ Auth + CRUDs (Tutor, Pet, Vaccine, Deworming, Medication), upload S3, seed
- **M2** ✅ Carteira Digital + QR Code (fila com retry/DLQ)
- **M3** ✅ Geolocalização + Clínicas — via Google Places API (`GET /clinicas/places`); tabela `clinica` local + PostGIS descartada
- **M4** ✅ Integrações Externas — Firebase push (FCM) + Google Calendar (unidirecional). Tokens OAuth cifrados em AES-256-GCM (`EncryptionService`)
- **M5** ✅ Interface do Veterinário (Web) — escrita reversa (nota clínica) + dashboard do vet + login/rotas protegidas. ADR-003 Aceita. DTOs convergidos para o shared.
- **M6** 🚧 **Testes + QA** — cobertura ≥ 80% na API, integração + E2E, e nascimento da camada de testes em web e mobile. Escopo e ordem abaixo
- **M7** ⏳ Documentação Final + Deploy + Entrega TCC

## M6 — Testes + QA

### Objetivo

Levar o ecossistema a uma cobertura de testes confiável e automatizada no CI: subir a API de ~40% para **≥ 80%** com unit + integração + E2E, e **criar do zero** a camada de testes de web e mobile (hoje inexistente). O alvo é entregar a Parte 2 com QA verde e reproduzível.

### Estado atual (linha de base)

- **api:** 28 arquivos `*.spec.ts`. `coverageThreshold` rebaixado para **40/30/45/40** (statements/branches/functions/lines) — meta M6 é restaurar e subir até ≥ 80%. E2E roda por `test/jest-e2e.json` (`npm run test:e2e`). Jest configurado inline no `package.json`.
- **web:** **0 testes, 0 infra** — sem Vitest/Jest, sem React Testing Library, sem jsdom. Tudo nasce em M6.
- **mobile:** **0 testes, 0 infra** — sem runner, sem RN Testing Library. Tudo nasce em M6.
- **shared:** sem issue de M6 (DTOs simples; testar só se algo concreto exigir).

### Escopo por repositório

**`petcard-api`** (milestone `M6 - Testes + QA`)

| Issue  | Título                                                 | Resumo                                                                     |
| ------ | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| PC-086 | Testes unitários dos services (Jest) — cobertura ≥ 80% | Cobrir services mockando Prisma + clientes externos; subir o threshold     |
| PC-087 | Testes de integração dos controllers (supertest)       | Controllers ponta-a-ponta com app Nest real + Prisma de teste              |
| PC-088 | Testes E2E dos fluxos principais                       | Fluxos críticos (auth tutor/vet, pet, carteira, nota clínica) com Postgres |
| PC-092 | Workflow de CD para staging (ECS Fargate)              | Deploy automatizado — **flavor de deploy, pode deslizar p/ M7**            |
| PC-093 | Workflow de CD para produção (manual approval)         | Deploy com aprovação manual — **flavor de deploy, pode deslizar p/ M7**    |

> ⚠️ PC-092/PC-093 estão rotuladas em M6 no GitHub, mas são **CD/deploy** (par natural de M7 com `petcard-infra`/Terraform). Em M6 o foco real é testes (PC-086/087/088); tratar CD junto do deploy de M7, salvo decisão em contrário do Ricardo.

**`petcard-web`**

| Issue  | Título                                        | Resumo                                                                |
| ------ | --------------------------------------------- | --------------------------------------------------------------------- |
| PC-089 | Testes de componentes (React Testing Library) | Bootstrap de Vitest + RTL + jsdom; cobrir login, rotas e form de nota |

**`petcard-mobile`**

| Issue  | Título                                               | Resumo                                                          |
| ------ | ---------------------------------------------------- | --------------------------------------------------------------- |
| PC-090 | Testes de componentes (React Native Testing Library) | Bootstrap de jest-expo + RN Testing Library; cobrir telas-chave |

### Ordem de execução ideal

**Entre repositórios** (do mais alavancado/maduro ao mais novo):

1. **`petcard-api` primeiro.** Já tem Jest e a maior superfície de risco. É onde se firmam os padrões (mocks de Prisma, helpers de E2E, Postgres no CI) que servem de referência. Maior ganho de cobertura por esforço.
2. **`petcard-web` em seguida.** Bootstrap da infra (Vitest + RTL) e PC-089. Independe da API, mas vem depois para reaproveitar as decisões de padrão de teste.
3. **`petcard-mobile` por último.** Bootstrap (jest-expo + RN Testing Library) e PC-090. Menor acoplamento, maior atrito de tooling (Expo/Metro) — fazer com a infra de teste já amadurecida nos outros repos.
4. **`petcard-shared`** não tem trabalho em M6.

**Dentro de `petcard-api`** (ordem dependente):

1. **PC-086 — unit dos services.** Cobrir service a service mockando `PrismaService` e clientes externos (S3, Firebase, Google, RabbitMQ). A cada faixa de cobertura ganha, **subir o `coverageThreshold`** em degraus (nunca rebaixar) até ≥ 80%.
2. **PC-087 — integração de controllers (supertest).** App Nest real com `ValidationPipe`, guards e DTOs do shared; Prisma apontando para um banco de teste. Valida wiring, RBAC (`@Auth`/`@Roles`) e contratos HTTP.
3. **PC-088 — E2E dos fluxos principais.** Postgres real no CI (service container ou testcontainers), migrations aplicadas, fluxos: login tutor + login vet, CRUD de pet, carteira/QR, criação de nota clínica (escrita reversa). Reusar helpers de PC-087.
4. **CI:** garantir `test`, `test:e2e` e `test:cov` no workflow com Postgres provisionado e o gate de cobertura. PC-092/093 (CD) só depois de tudo verde — preferencialmente em M7.

**Dentro de `petcard-web`** (PC-089):

1. Bootstrap: adicionar Vitest + `@testing-library/react` + `@testing-library/jest-dom` + `jsdom`, script `test`, config (Vite `test` block) e setup file.
2. Testar primeiro o que é crítico e estável: fluxo de **login**, **`ProtectedRoute`** (redirect sem token) e **submit do form de nota clínica** (validação client + chamada de service mockada).
3. Subir gradualmente para dashboard e perfil do pet.

**Dentro de `petcard-mobile`** (PC-090):

1. Bootstrap: `jest-expo` como preset + `@testing-library/react-native` + `jest` config; script `test`.
2. Cobrir telas/fluxos-chave (ex.: carteira do pet, scanner, render das listas de saúde) com mocks de navegação e de chamadas de API.

### Padrões específicos de M6

- **Subir o piso, nunca abaixar.** O `coverageThreshold` da API é um catraca: a cada PR que melhora cobertura, elevar o floor no mesmo PR. Meta final 80/.../80.
- **Banco de teste isolado.** Integração/E2E não tocam o banco de dev. Usar Postgres dedicado (service container no CI; local via compose com DB próprio) + migrations + reset entre suites. Nada de mock de Prisma em E2E — o objetivo é exercitar o caminho real.
- **Determinismo.** Sem dependência de relógio/rede real. Mockar tempo onde a lógica depende de datas; clientes externos (S3, FCM, Google, RabbitMQ) sempre mockados em unit e integração.
- **Reaproveitar fixtures/helpers.** Um único `createTestApp()` + factories de dados para api; um `renderWithProviders()` (router + i18n + context) para web/mobile. Não duplicar setup por arquivo.
- **i18n no web/mobile.** Renderizar componentes dentro do provider de i18n; asserir por papel/rótulo acessível, não por string crua de um idioma.
- **CI verde é o DoD.** Toda issue de M6 só fecha com o teste rodando no GitHub Actions, não só localmente.

## Padrões a seguir (gerais)

- **Investigar antes de codar.** Ler o módulo/serviço alvo e seus testes vizinhos antes de escrever novos. No api, espelhar o estilo dos `*.spec.ts` existentes (ex.: `pet.service.spec.ts`, módulo de notificação).
- **DTOs no `@petcardorg/shared`.** Toda request/response nova vai como DTO no shared (bump minor + publish), consumida por api/web/mobile. Em M5 a duplicação local foi removida — não reintroduzir DTOs locais que já existem no shared.
- **Testes.** Unit para services (mock de Prisma + externos), integração para controllers (supertest), E2E para fluxos. Cobertura é catraca crescente.
- **Migrations.** `npx prisma migrate dev --name <descricao_snake_case>`. Para SQL fora do Prisma, `--create-only` + edição manual.
- **Auth (api).** `@Auth()` + `@Roles(Role.VET)`/`Role.TUTOR`; usuário via `@CurrentUser()` — nunca ler claim JWT direto no controller.
- **Filas.** Toda fila nova precisa de DLX/DLQ + retry (padrão `qr-code.generate`/`notification.push`).
- **Configuração.** Variáveis sensíveis em `.env` com entrada no `.env.example`. Sem fallback hardcoded; em produção, faltar variável crítica = falha rápida no boot.

## Convenções gerais

- **Branches:** `feat/pc-XXX-descricao`, `fix/pc-XXX-...`, `chore/...`, `test/pc-XXX-...`, `docs/...`
- **Commits:** Conventional Commits (`test(vet): cobrir VetNoteService`)
- **PRs:** mirar `develop`; título `tipo: PC-XXX - Descrição`, com checklist de DoD
- **DTOs compartilhados:** sempre em `@petcardorg/shared`, bump minor para feature, patch para fix de tipo
- **ADRs:** decisões arquiteturais relevantes em `petcard-docs/architecture/adr/` antes de mergear

## Princípios de trabalho

- **YAGNI.** Não montar infra de teste além do necessário (sem E2E de browser real no web se RTL cobre; sem testcontainers se service container do Actions resolve).
- **Reutilizar antes de criar.** Antes de novo helper/factory, procurar equivalente no repo e nos outros.
- **Falha de serviço externo não derruba a API.** Manter os caminhos de degradação cobertos por teste (ex.: push falho não invalida criação de nota).
- **Validação na borda.** `ValidationPipe` global + `class-validator` nos DTOs; cobrir os casos de rejeição nos testes de integração.

## Escopo fora desta milestone (não fazer agora)

- Reintroduzir Auth0 (abandonado em M0-#7) ou DTOs locais já no shared
- Deploy de produção / `petcard-infra` / Terraform e o relatório/slides da Parte 2 (é M7; PC-092/093 vão junto)
- Sync bidirecional do Google Calendar (PC-065, futuro)
- Reintroduzir tabela `clinica` local + PostGIS (descartado em 2026-05-12)
- Refactors amplos não relacionados a teste/QA

## Ambiente de desenvolvimento

- API: Docker Compose em `docker/docker-compose.yml` (postgis/postgis:16-3.4, redis:7-alpine, rabbitmq:3-management-alpine) + `npm run start:dev`
- Web: `npm run dev` (Vite :5173). `VITE_API_URL` aponta para a API (default `http://localhost:3000`)
- Resolver `@petcardorg/shared` do GitHub Packages exige `NODE_AUTH_TOKEN` (PAT com `read:packages`)
- API obriga `CORS_ORIGINS` em produção; em dev usa defaults de localhost (Vite :5173, API :3000, Expo :8081/:19006)
- Swagger/OpenAPI da API em `GET /docs` (M5/PC-097)

## Comandos úteis

```bash
# API — testes
npm test                       # unit (jest, *.spec.ts)
npm run test:cov               # com cobertura (verifica o coverageThreshold)
npm run test:e2e               # E2E (test/jest-e2e.json) — precisa de Postgres
docker compose -f docker/docker-compose.yml up -d   # subir Postgres/RabbitMQ para E2E local
npx prisma migrate deploy      # aplicar migrations no banco de teste

# Web (no petcard-web) — após bootstrap de Vitest
npm test
npm run build                  # tsc -b && vite build
npm run lint

# Mobile (no petcard-mobile) — após bootstrap de jest-expo
npm test
npm run typecheck

# Issues da M6 (por repo)
gh issue list --repo PetCardOrg/petcard-api    --milestone "M6 - Testes + QA" --state all
gh issue list --repo PetCardOrg/petcard-web    --milestone "M6 - Testes + QA" --state all
gh issue list --repo PetCardOrg/petcard-mobile --milestone "M6 - Testes + QA" --state all
```

## Última atualização

2026-06-17 — **Início da M6 (Testes + QA).** CLAUDE.md refocado de M5 para M6. M5 marcada concluída (escrita reversa, dashboard do vet, login/rotas protegidas, ADR-003 Aceita, DTOs convergidos para o shared, Swagger em `/docs`). Escopo de M6 levantado das issues reais: api PC-086 (unit ≥80%), PC-087 (integração/supertest), PC-088 (E2E); web PC-089 (RTL); mobile PC-090 (RN Testing Library); PC-092/093 (CD) ficam rotuladas em M6 mas são deploy (par de M7). Linha de base registrada: api com 28 specs e threshold 40/30/45/40; web e mobile **sem nenhuma infra de teste**. Ordem de execução ideal definida — entre repos (api → web → mobile; shared sem trabalho) e dentro da api (PC-086 → PC-087 → PC-088 → CI/cobertura). Contexto de prazo: Parte 1 já apresentada, Parte 2 até dezembro/2026.
