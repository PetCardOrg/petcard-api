# PetCard — Contexto para Claude Code (foco: Milestone 7 — Documentação Final + Entrega TCC)

## Projeto

PetCard — carteira digital de saúde para pets. TCC do Ricardo Temporal.
Multirepo sob `PetCardOrg`:

- `petcard-api` (NestJS + Prisma + Postgres + RabbitMQ + S3) — em M7: Swagger (PC-097), CD staging/produção (PC-092/093)
- `petcard-web` (SPA Vite + React) — em M7: deploy Vercel (parte da PC-105) + screenshots/README (PC-096)
- `petcard-mobile` (React Native + Expo) — em M7: screenshots/README (PC-096) e evidências dos UCs (PC-094)
- `petcard-shared` (npm `@petcardorg/shared` no GitHub Packages, **`0.9.0`**) — sem issue de M7 além de release/CHANGELOG (PC-108)
- `petcard-docs` (ADRs, board centralizado, documentação) — **concentra a M7**: 13 issues (relatório, slides, vídeo, deploy, release)

**Equipe:** Álvaro Araújo (Backend), Camila Martins (DevOps/PM), Ricardo Temporal (Frontend Lead — atua na API desde M2).

**Contexto de prazo:** a **Parte 1 do TCC já foi apresentada à banca**. A **Parte 2 vai até dezembro/2026** — há folga de tempo. M7 é a última milestone: fecha a Parte 2 com documentação, deploy e entrega. Trabalhar com qualidade, sem regime de "reta final".

## Stack relevante

- **Backend:** NestJS 11, Prisma 6, PostgreSQL 16 + PostGIS (PostGIS instalado mas sem uso após pivô para Google Places), AWS S3, RabbitMQ (filas com DLX/DLQ + retry). Redis provisionado no compose, **não consumido em código** (item P3 da auditoria: manter só se a narrativa de defesa usar "capacidade reservada"; senão remover do compose).
- **Web:** Vite + React 19 + TypeScript, `react-router-dom` v7, i18n (pt-BR + en-US). HTTP via `apiFetch` próprio (`src/services/api.ts`). Área autenticada do vet entregue em M5: token em `localStorage` + React Context + `ProtectedRoute`.
- **Mobile:** React Native + Expo + TypeScript.
- **Auth:** JWT próprio (HS256 + bcrypt), roles `TUTOR` e `VET`, discriminadas pelo claim `role` (logins separados `login`/`loginVeterinario`). Auth0 foi abandonado (M0-#7) — **não reintroduzir**. Sem refresh token.
- **Shared:** DTOs em `@petcardorg/shared@0.9.0`. api e web consomem os DTOs direto do shared (duplicação local removida em M5). Resolver o pacote exige `NODE_AUTH_TOKEN` (PAT com `read:packages`).

## Status das milestones

- **M0–M5** ✅ Setup → Auth/CRUDs → Carteira+QR → Geolocalização (Google Places) → Integrações (FCM + Google Calendar) → Interface do Vet
- **M6** ✅ **Testes + QA — concluída em 2026-07-16** (milestones M0–M6 fechadas no GitHub nos 5 repos). Cobertura api **85.3/81.3/94.4/86.9** com catraca **84/80/93/85**; web ~82%; mobile ~15% (catraca 14/7/17/14 — telas pesadas são a próxima elevação); E2E contra Postgres real no CI; badges SVG auto-gerados nos 4 repos com código; 0 vulns de `npm audit` nos 5 repos.
- **M7** 🚧 **Documentação Final + Deploy + Entrega TCC** — única milestone aberta. Escopo e ordem abaixo.

## M7 — Documentação Final + Entrega TCC

### Objetivo

Entregar a Parte 2: API documentada (Swagger + Postman), sistema em produção (ECS + Vercel), evidências de QA (execução dos 16 UCs + screenshots), relatório ABNT + slides + vídeo, ADRs finais e release v1.0.0 nos 5 repos.

### Escopo por repositório

**`petcard-api`** (milestone `M7 - Documentacao Final + Entrega TCC`)

| Issue  | GitHub | Título                                         | Resumo                                                                          |
| ------ | ------ | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| PC-097 | api#44 | Documentar API com Swagger/OpenAPI             | Decorators nos controllers; UI + schemas completos. **Quita o P3 da auditoria** |
| PC-092 | api#42 | Workflow de CD para staging (ECS Fargate)      | Movida de M6 (decisão 2026-07-16); par da PC-105                                |
| PC-093 | api#43 | Workflow de CD para produção (manual approval) | Movida de M6; depende da PC-092                                                 |

**`petcard-docs`** (13 issues — board centralizado da entrega)

| Issue  | GitHub  | Título                                                                                                                    |
| ------ | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| PC-094 | docs#10 | Execução manual dos 16 UCs com evidências (re-escopada de M6; roteiro já entregue em `docs/qa/roteiro-testes-manuais.md`) |
| PC-096 | docs#12 | READMEs finais com screenshots (badges já ok em todos)                                                                    |
| PC-098 | docs#13 | Collection Postman com todos os endpoints                                                                                 |
| PC-099 | docs#14 | Exportar diagramas finais do DAS em alta resolução                                                                        |
| PC-100 | docs#15 | Capítulo de Metodologia (relatório TCC)                                                                                   |
| PC-101 | docs#16 | Capítulo de Resultados e Discussão                                                                                        |
| PC-102 | docs#17 | Capítulo de Conclusão                                                                                                     |
| PC-103 | docs#18 | Revisar e formatar relatório final (ABNT)                                                                                 |
| PC-104 | docs#19 | Apresentação de defesa (slides)                                                                                           |
| PC-105 | docs#20 | Deploy final em produção (AWS ECS + Vercel)                                                                               |
| PC-106 | docs#21 | Vídeo demonstrativo do sistema                                                                                            |
| PC-107 | docs#22 | ADRs finais                                                                                                               |
| PC-108 | docs#23 | Tag de release v1.0.0 + CHANGELOG em cada repo                                                                            |

### Ordem de execução ideal

Quatro trilhas, da mais autocontida à mais dependente:

1. **Documentação da API** — PC-097 (Swagger) primeiro: autocontida, melhora a defesa, quita o P3 da auditoria. PC-098 (Postman) logo depois, aproveitando o OpenAPI pronto.
2. **Deploy** — PC-092 (CD staging) → PC-093 (CD produção) → PC-105 (deploy final ECS + Vercel). Trilha da Camila (DevOps) por afinidade, mas sem dono rígido.
3. **Evidências de QA** — PC-094 (executar os 16 UCs, idealmente contra staging já no ar) gera as evidências que alimentam PC-096 (screenshots nos READMEs) e PC-106 (vídeo demo, reusa o roteiro). Fazer depois do deploy para gravar contra ambiente real.
4. **Texto e entrega** — PC-107 (ADRs) e PC-099 (diagramas DAS) primeiro (insumos do relatório); depois PC-100→101→102 (capítulos em ordem), PC-103 (ABNT), PC-104 (slides). **PC-108 (release v1.0.0 + CHANGELOG) é sempre a última**, com develop→main final nos 5 repos.

As trilhas 1 e 2 são paralelizáveis; a 3 depende da 2; a 4 pode andar em paralelo mas fecha por último.

### PC-097 — linha de base (levantada 2026-07-16)

- `nest-cli.json` já tem `plugins: ["@nestjs/swagger"]` (CLI plugin infere tipos de DTOs/retornos).
- `src/main.ts` já monta `DocumentBuilder` + `SwaggerModule.setup('docs', ...)` — UI em **`/docs`**.
- ⚠️ O critério de aceite da issue diz `/api/docs`; o código serve em `/docs`. Alinhar com o Ricardo: mover a rota ou corrigir a issue.
- **Zero decorators** (`@ApiTags/@ApiOperation/@ApiResponse/@ApiBearerAuth`) nos **15 controllers** (`find src -name "*.controller.ts"`). O trabalho é: tags por módulo, operation/response por endpoint (incl. códigos de erro), bearer auth nos protegidos, e conferir que DTOs do shared aparecem nos schemas.

### Padrões específicos de M7

- **Evidência é entregável.** UC executado sem screenshot/registro não conta; planilha de execução do roteiro (`docs/qa/roteiro-testes-manuais.md`) é a fonte de verdade da PC-094.
- **Contas do seed para demo/UCs:** tutores `ana.silva@example.com` / `bruno.costa@example.com`, vet `camila.ferreira@vet.example.com`, senha `petcard123`.
- **Docs canônicos em `petcard-docs/docs/`** (tap.md, das.md, auditorias/, qa/) — editar lá via PR; a pasta local `tcc/docs/` foi removida, não recriar.
- **Catracas de cobertura não abaixam** por causa de trabalho de M7 (api 84/80/93/85). Se um ajuste de código derrubar cobertura, cobrir junto.
- **Deploy com aprovação manual em produção** (PC-093) — nunca CD direto para prod.
- **Limitações conhecidas a declarar na demo/relatório:** Calendar unidirecional; alertas por janela de dose; push exige `FCM_ENABLED` + device físico.

## Padrões a seguir (gerais)

- **Investigar antes de codar.** Ler o módulo/serviço alvo e seus testes vizinhos antes de escrever novos.
- **DTOs no `@petcardorg/shared`.** Toda request/response nova vai como DTO no shared (bump minor + publish). Não reintroduzir DTOs locais que já existem no shared.
- **Testes.** Unit para services (mock de Prisma + externos), integração para controllers (supertest), E2E para fluxos. Cobertura é catraca crescente.
- **Migrations.** `npx prisma migrate dev --name <descricao_snake_case>`. Para SQL fora do Prisma, `--create-only` + edição manual.
- **Auth (api).** `@Auth()` + `@Roles(Role.VET)`/`Role.TUTOR`; usuário via `@CurrentUser()` — nunca ler claim JWT direto no controller.
- **Filas.** Toda fila nova precisa de DLX/DLQ + retry (padrão `qr-code.generate`/`notification.push`).
- **Configuração.** Variáveis sensíveis em `.env` com entrada no `.env.example`. Sem fallback hardcoded; em produção, faltar variável crítica = falha rápida no boot.

## Convenções gerais

- **Branches:** `feat/pc-XXX-descricao`, `fix/pc-XXX-...`, `chore/...`, `test/pc-XXX-...`, `docs/...`
- **Commits:** Conventional Commits (`docs(api): PC-097 - decorators Swagger nos controllers`)
- **PRs:** mirar `develop`; título `tipo: PC-XXX - Descrição`, com checklist de DoD
- **DTOs compartilhados:** sempre em `@petcardorg/shared`, bump minor para feature, patch para fix de tipo
- **ADRs:** decisões arquiteturais relevantes em `petcard-docs/architecture/adr/` antes de mergear
- **Recorrente:** `main` fica para trás de `develop` — mergear develop→main a cada marco (PR head=develop base=main). Antes, verificar que main não tem commit de conteúdo exclusivo (`git log --no-merges origin/develop..origin/main`).

## Princípios de trabalho

- **YAGNI.** Documentar/deployar o que existe; sem infra nova além do necessário para PC-092/093/105.
- **Reutilizar antes de criar.** O roteiro de UCs, o DAS e as auditorias já existem — o relatório e o vídeo os consomem, não os recriam.
- **CI verde é o DoD.** Issue de M7 com código só fecha com o CI passando; issue de doc só fecha com o artefato versionado no petcard-docs.
- **Board sincronizado com o código.** Fechar issue no merge, referenciando commit/PR — o board já dessincronizou mais de uma vez (PC-070, PC-110).

## Escopo fora desta milestone (não fazer agora)

- Features novas de produto (M7 é documentação, deploy e entrega)
- Reintroduzir Auth0, DTOs locais já no shared, ou tabela `clinica` local + PostGIS
- Sync bidirecional do Google Calendar (PC-065, futuro)
- Elevar cobertura do mobile além da catraca atual (registrado como próxima elevação, não é M7)
- Refactors amplos não relacionados à entrega

## Ambiente de desenvolvimento

- API: Docker Compose em `docker/docker-compose.yml` (postgis/postgis:16-3.4, redis:7-alpine, rabbitmq:3-management-alpine) + `npm run start:dev`
- Web: `npm run dev` (Vite :5173). `VITE_API_URL` aponta para a API (default `http://localhost:3000`)
- Resolver `@petcardorg/shared` do GitHub Packages exige `NODE_AUTH_TOKEN` (PAT com `read:packages`)
- API obriga `CORS_ORIGINS` em produção; em dev usa defaults de localhost (Vite :5173, API :3000, Expo :8081/:19006)
- Swagger/OpenAPI da API em `GET /docs`

## Comandos úteis

```bash
# API
npm test                       # unit (jest, *.spec.ts)
npm run test:cov               # com cobertura (verifica a catraca 84/80/93/85)
npm run test:e2e               # E2E (test/jest-e2e.json) — precisa de Postgres
npm run start:dev              # Swagger UI em http://localhost:3000/docs
docker compose -f docker/docker-compose.yml up -d   # Postgres/RabbitMQ locais

# Web / Mobile
npm test                       # vitest (web) / jest-expo (mobile)
npm run build                  # web: tsc -b && vite build

# Issues da M7 (por repo)
gh issue list --repo PetCardOrg/petcard-api  --milestone "M7 - Documentacao Final + Entrega TCC" --state all
gh issue list --repo PetCardOrg/petcard-docs --milestone "M7 - Documentacao Final + Entrega TCC" --state all
```

## Última atualização

2026-07-16 — **Início da M7 (Documentação Final + Entrega TCC).** CLAUDE.md refocado de M6 para M7. M6 concluída e milestones M0–M6 fechadas no GitHub nos 5 repos: cobertura api 85.3/81.3/94.4/86.9 (catraca 84/80/93/85, dívida "branches ≥80" quitada via api#104 — `src/config/__tests__/config.spec.ts` + opcionais do card.service), web ~82%, mobile ~15%, badges SVG auto-gerados, 0 vulns. Backlog P2 da auditoria delta todo concluído (commit 8c4acd9 no docs); restam 2 P3 que vivem dentro da M7 (Swagger→PC-097; Redis sem uso→decisão na narrativa da defesa). Escopo de M7 levantado das issues reais: api PC-097/092/093; docs PC-094 (execução dos UCs, re-escopada de M6), PC-096, PC-098–108. Ordem definida em 4 trilhas (docs da API → deploy → evidências de QA → texto/entrega; release v1.0.0 por último). Primeira issue em execução: **PC-097** (linha de base: plugin + UI em `/docs` ativos, zero decorators nos 15 controllers; divergência `/docs` vs `/api/docs` do critério de aceite a alinhar).

2026-06-19 — **PC-088 (E2E dos fluxos principais) concluída.** Suíte E2E reescrita contra Postgres real (mockando só infra externa); infra em `test/utils/e2e-app.ts` + `test/utils/e2e-db.ts`; 24 testes/5 suites; CI com service container Postgres. Frente de testes da API encerrada (PC-086/087/088).

2026-06-17 — **Início da M6 (Testes + QA).** Linha de base: api com 28 specs e threshold 40/30/45/40; web e mobile sem infra de teste. Ordem entre repos api → web → mobile executada conforme planejado.
