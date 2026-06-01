# PetCard — Contexto para Claude Code (foco: Milestone 5 — Interface do Veterinário / Web)

## Projeto

PetCard — carteira digital de saúde para pets. TCC do Ricardo Temporal.
Multirepo sob `PetCardOrg`:

- `petcard-web` (SPA Vite + React) — **foco principal desta milestone** (dashboard, login e telas do veterinário)
- `petcard-api` (NestJS + Prisma + Postgres + Redis + S3) — módulo Veterinário + VetNote (escrita reversa)
- `petcard-shared` (npm `@petcardorg/shared` no GitHub Packages) — DTOs de Veterinario/NotaClinica
- `petcard-mobile` (React Native + Expo) — sem trabalho nesta milestone
- `petcard-docs` (ADRs, board centralizado, documentação)

**Equipe:** Álvaro Araújo (Backend), Camila Martins (DevOps/PM), Ricardo Temporal (Frontend Lead — vem atuando na API desde M2; M5 traz o foco de volta para o frontend web).

## Stack relevante

- **Backend:** NestJS, Prisma, PostgreSQL (PostGIS instalado mas sem uso após pivô para Google Places), Redis (no compose, ainda sem uso em código), AWS S3, RabbitMQ
- **Web:** Vite + React + TypeScript, `react-router-dom` v7, i18n (pt-BR + en-US). HTTP via `apiFetch` próprio (`src/services/api.ts`) — hoje **GET-only, sem header de Authorization**. Sem lib de auth, sem gerenciador de estado, sem cliente de query. A área autenticada (login, rotas protegidas, sessão) **ainda não existe** e nasce nesta milestone.
- **Auth:** JWT próprio (HS256 + bcrypt), roles `TUTOR` e `VET`. Auth0 foi abandonado (ver M0-#7) — **não reintroduzir**.
- **Decorators existentes (api):** `@CurrentUser`, `@Roles`, `@Auth`
- **Guards existentes (api):** `JwtAuthGuard`, `RolesGuard` (síncrono, role propagado pelo `JwtStrategy`)
- **Shared:** DTOs em `@petcardorg/shared`, versão atual **`0.8.0`** (api usa `^0.7.0`/`^0.8.0`; web ainda em `^0.7.0` — alinhar nesta milestone)

## Status das milestones

- **M0** ✅ Setup, GitHub Packages, ADR-001 multirepo, project board, ferramental (ESLint/Prettier/Husky/CI) em todos os 5 repos
- **M1** ✅ Auth + CRUDs (Tutor, Pet, Vaccine, Deworming, Medication), upload S3, seed
- **M2** ✅ Carteira Digital + QR Code (fila com retry/DLQ)
- **M3** ✅ Geolocalização + Clínicas — entregue via Google Places API (`GET /clinicas/places`); tabela `clinica` local + PostGIS foi descartada
- **M4** ✅ Integrações Externas — Firebase push (FCM) + Google Calendar (unidirecional, PetCard → Google). PC-065 (sync bidirecional) descopada como limitação consciente (ver ADR-002)
- **M5** 🚧 **Interface do Veterinário (Web)** — em andamento. Escrita reversa (vet escreve notas clínicas no histórico do pet) + painel/dashboard do veterinário na web. Escopo abaixo
- **M6** ⏳ Testes + QA (cobertura ≥ 80%, E2E)
- **M7** ⏳ Documentação Final + Entrega TCC

### Auditoria M0-M3 (2026-05-11) — fechada

As 8 recomendações de `audits/auditoria-completa-M0-M3-2026-05-11.md` foram endereçadas até 2026-05-14 (índice GiST depois descartado no pivô; shared alinhado; ferramental do shared; CI do mobile; fonte única de role; DLX/DLQ no qr-code; CORS allowlisted e Auth0 removido do mobile; higiene geral).

## M5 — Interface do Veterinário (Web)

### Objetivo

Dar ao veterinário uma interface web própria para consultar pets e **escrever de volta no histórico de saúde** (escrita reversa). Até aqui o histórico só era alimentado pelo tutor; M5 abre o caminho clínico: o vet autenticado adiciona notas (diagnóstico + prescrição) que aparecem no histórico do pet e disparam push para o tutor.

### Escopo por repositório

**`petcard-api`** (label milestone `M5 - Interface Veterinario (Web)`)

| Issue  | Título                                           | Resumo                                                                                           |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| PC-075 | CRUD módulo Veterinário                          | CRUD completo com validação de CRMV, vinculado a clínica                                         |
| PC-076 | Módulo VetNote: Notas Clínicas (escrita reversa) | Vet autenticado escreve nota; aparece no histórico do pet; tutor **não** pode editar nota do vet |
| PC-077 | Push ao tutor quando nota clínica é adicionada   | Push automático após criação da nota; mensagem inclui nome do pet e do veterinário               |
| PC-083 | Migrations: `veterinario`, `nota_clinica`        | Tabelas com relacionamentos corretos; **CRMV como campo único**                                  |

**`petcard-web`**

| Issue  | Título                                                | Resumo                                                                          |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| PC-078 | Tela de Login do veterinário                          | Login + redirect para dashboard (ver decisão de auth abaixo — **JWT próprio**)  |
| PC-079 | Dashboard do veterinário: lista de pets atendidos     | Lista de pets atendidos recentemente, busca por nome do pet ou tutor, paginação |
| PC-080 | Tela de perfil do pet com histórico completo          | Vacinas, vermifugações, medicações e notas clínicas em timeline cronológica     |
| PC-081 | Formulário de Nota Clínica (diagnóstico + prescrição) | Campos diagnóstico/prescrição/observações, validação no client, salva via API   |
| PC-082 | Scanner de QR Code para acesso rápido à carteira      | Abre câmera do dispositivo, lê QR e redireciona para o perfil do pet            |

**`petcard-shared`**

| Issue  | Título                                        | Resumo                                                            |
| ------ | --------------------------------------------- | ----------------------------------------------------------------- |
| PC-084 | DTOs para Veterinario e NotaClinica           | Interfaces exportadas via `index.ts`, campos alinhados ao Prisma  |
| PC-085 | Publicar release do shared com os DTOs do vet | Nova versão no GitHub Packages (a partir de `0.8.0` → bump minor) |

> ⚠️ **Números de versão nas issues estão desatualizados.** PC-085 menciona `@petcard/shared@0.3.0`, mas o pacote real é `@petcardorg/shared` e já está em `0.8.0` → o release de M5 será **`0.9.0`** (bump minor). Usar o nome e a numeração reais.

### Decisões de arquitetura M5 (fechadas com Ricardo em 2026-05-29)

1. **Identidade do veterinário: tabela `veterinario` dedicada.** Entidade própria (CRMV único, vínculo com clínica), separada de `Tutor`. O `enum Role { VET, TUTOR }` existente em `Tutor` **não** é o caminho — o vet deixa de ser modelado como um Tutor com `role=VET`. Segue PC-083. Documentar em ADR-003 antes de mergear, incluindo o destino do `Role.VET` legado.
2. **Auth da web: JWT próprio (HS256 + bcrypt), o mesmo da API.** A menção a "Auth0" na issue PC-078 está desatualizada — Auth0 foi abandonado (M0-#7) e **não será reintroduzido**. O login do vet emite/consome o mesmo JWT do resto do sistema.

### Decisões a fechar na sessão de arquitetura M5 (antes de codar — registrar em ADR-003)

- **Sujeito do JWT com duas tabelas.** Hoje o `JwtStrategy` resolve o principal a partir de `tutor` (fonte única `tutor.role`). Com `veterinario` em tabela separada, definir como o token identifica o tipo de principal (claim de tipo? tabela-alvo no `sub`? estratégia/guard separados?). Isso afeta `@CurrentUser`, `@Roles(Role.VET)` e o `RolesGuard`.
- **Relação nota clínica ↔ histórico.** `VaccineRecord`/`DewormingRecord` têm hoje `veterinarianName String?` (texto livre). Decidir se `nota_clinica` é uma entidade nova no histórico do pet (provável) e se/como conviver com o campo de nome livre legado.
- **Vínculo vet ↔ pet ("pets atendidos").** O dashboard (PC-079) lista "pets atendidos recentemente" — definir a fonte (derivado de notas clínicas? tabela de vínculo? escopo por clínica?).
- **Sessão/estado no web.** Onde guardar o token (memória + refresh? `localStorage`?), como proteger rotas (`react-router` v7) e se entra alguma lib de estado/query — manter YAGNI, só o necessário para login + dashboard + perfil.

### Padrões específicos de M5

- **Backend (vet/VetNote):** seguir o padrão module/controller/service/dto já usado (`PetService`, `TutorService`, `CardService`). Migrations com `prisma migrate dev`; CRMV com constraint `UNIQUE`. Push da PC-077 reusa a fila `notification.push` (DLX/DLQ + `x-retry-count`) montada em M4 — o service de nota só publica, o worker envia.
- **Escrita reversa é só do vet.** Tutor não edita nem apaga nota do veterinário — impor via `@Roles` + checagem de propriedade no service. A nota é imutável pelo tutor.
- **Frontend (web):** a área autenticada nasce agora. Estender `apiFetch` (`src/services/api.ts`) para enviar `Authorization: Bearer` e suportar `POST/PATCH` com body — hoje é GET-only. Reusar o padrão de `services/*.service.ts` (ex.: `card.service.ts`) para as chamadas de vet/nota/pet. Rotas protegidas com `react-router-dom` v7.
- **i18n obrigatório no web.** Toda string de UID nova entra em `src/i18n/locales/pt-BR` **e** `en-US` — nada de texto hardcoded. Seguir o padrão do `LanguageSwitcher`/`PublicCard` existentes.
- **DTOs no shared primeiro.** `Veterinario` e `NotaClinica` (PC-084) saem como DTOs em `@petcardorg/shared`, com campos alinhados ao schema Prisma, antes de api/web consumirem. Bump minor → publish `0.9.0` (PC-085) → alinhar `petcard-api` e `petcard-web` (web ainda em `^0.7.0`).
- **Secret hygiene.** Qualquer variável nova (ex.: `VITE_API_URL` já existe no web) entra no `.env.example` com placeholder. Nada hardcoded.

## Padrões a seguir (gerais)

- **Investigar antes de codar.** Ler módulos existentes antes de propor arquitetura nova. No web, ler `pages/PublicCard`, `services/api.ts`, `services/card.service.ts` e o setup de i18n/router em `main.tsx`. No api, ler `PetService`/`TutorService`/`CardService` e o módulo de notificação de M4.
- **DTOs no `@petcardorg/shared`.** Toda request/response nova vai como DTO no shared, com bump minor + publish. Atualizar consumidores (api/web) na mesma PR ou em PR encadeada.
- **Testes.** Unit para o service (mockando Prisma e clientes externos), e2e para endpoints novos no api. No web, cobrir ao menos o fluxo de login e o submit da nota. Manter `coverageThreshold` global no api (40/30/45/40 hoje — subir floor conforme cobertura melhora; meta ≥ 80% é M6).
- **Migrations.** `npx prisma migrate dev --name <descricao_snake_case>`. Para SQL fora do que o Prisma cobre, `--create-only` + edição manual.
- **Auth (api).** Usar `@Auth()` + `@Roles(Role.VET)` / `Role.TUTOR`; recuperar usuário via `@CurrentUser()` — nunca ler claim JWT direto em controller.
- **RBAC.** Não reintroduzir leitura do claim `permissions`. Resolver o principal pelo `JwtStrategy` (ver decisão aberta sobre duas tabelas acima).
- **Filas.** Toda nova fila precisa de DLX/DLQ + retry — seguir o padrão de `qr-code.generate`/`notification.push` (ver `RabbitMqTopologyService` + headers `x-retry-count`).
- **Configuração.** Variáveis sensíveis em `.env` (com entrada no `.env.example`). Nada de fallback hardcoded. Em produção, faltar variável crítica = falha rápida no boot.

## Convenções gerais

- **Branches:** `feat/pc-XXX-descricao`, `fix/pc-XXX-...`, `chore/...`
- **Commits:** Conventional Commits (`feat(vet): add clinical note endpoint`)
- **PRs:** título `feat: PC-XXX - Descrição`, com checklist de DoD na descrição
- **DTOs compartilhados:** sempre em `@petcardorg/shared`, bump minor para nova feature, patch para fix de tipo
- **ADRs:** decisões arquiteturais relevantes documentadas em `petcard-docs/architecture/adr/` antes de mergear (M5 → ADR-003)

## Princípios de trabalho

- **YAGNI.** Sem cache, sem fila, sem gerenciador de estado/query no web sem demanda real. Login + dashboard + perfil + form de nota não exigem Redux/React Query por padrão — só entram se houver uso concreto.
- **Reutilizar antes de criar.** Antes de novo service/util, procurar equivalente em `petcard-api`, `petcard-web` e `@petcardorg/shared`.
- **Falha de serviço externo não derruba a API.** Google, Firebase, S3 — todos têm caminho de degradação. O push da PC-077 não pode fazer a criação da nota falhar.
- **Validação na borda.** `ValidationPipe` global + `class-validator` nos DTOs do api; validação no client nos forms do web (PC-081).
- **Atualizar `@petcardorg/shared` exige bump + publish** (workflow `publish.yaml` no shared).

## Escopo fora desta sessão (não fazer agora)

- Reintroduzir Auth0 (abandonado em M0-#7) — login do vet usa JWT próprio
- Trabalho no `petcard-mobile` (M5 não toca o mobile)
- Cobertura ≥ 80% e E2E amplo (é M6); deploy de produção e relatório (é M7)
- Webhooks de entrada, email transacional, SMS (seguem fora de escopo desde M4)
- Sync bidirecional do Google Calendar (PC-065, candidata a futuro)
- Reintroduzir tabela `clinica` local + PostGIS (descartado em 2026-05-12)
- Refactors amplos não relacionados ao módulo veterinário / interface web

## Ambiente de desenvolvimento

- API: Docker Compose em `docker/docker-compose.yml` (postgis/postgis:16-3.4, redis:7-alpine, rabbitmq:3-management-alpine) + `npm run start:dev`
- Web: `npm run dev` (Vite :5173). `VITE_API_URL` aponta para a API (default `http://localhost:3000`)
- Resolver `@petcardorg/shared` do GitHub Packages exige `NODE_AUTH_TOKEN=$GITHUB_TOKEN`
- API obriga `CORS_ORIGINS` em produção; em dev usa defaults de localhost (Vite :5173, API :3000, Expo :8081/:19006)

## Comandos úteis

```bash
# API
docker compose -f docker/docker-compose.yml up -d
npm run start:dev
npx prisma migrate dev --name <descricao>           # ex.: add_veterinario_nota_clinica
npx prisma migrate dev --create-only --name <desc>  # editar SQL antes de aplicar
npm test && npm run test:e2e
npm run db:seed

# Web (no petcard-web)
npm run dev          # Vite :5173
npm run build        # tsc -b && vite build
npm run lint

# Shared — publicar 0.9.0 com DTOs do vet (PC-084/PC-085)
# bump version em package.json → push → workflow publish.yaml

# Issues da M5 (por repo)
gh issue list --repo PetCardOrg/petcard-api    --milestone "M5 - Interface Veterinario (Web)" --state all
gh issue list --repo PetCardOrg/petcard-web    --milestone "M5 - Interface Veterinario (Web)" --state all
gh issue list --repo PetCardOrg/petcard-shared --milestone "M5 - Interface Veterinario (Web)" --state all

# Fila — limpar fila com args divergentes antes de redeploy
docker exec petcard-rabbitmq rabbitmqctl delete_queue notification.push
```

## Última atualização

2026-05-29 — **Início da M5 (Interface do Veterinário / Web).** CLAUDE.md refocado de M4 para M5. Escopo levantado das issues nos repos `petcard-api` (PC-075/076/077/083), `petcard-web` (PC-078/079/080/081/082) e `petcard-shared` (PC-084/085). Duas decisões fechadas com Ricardo: (1) **tabela `veterinario` dedicada** (CRMV único, vínculo com clínica) em vez de reusar `Tutor`+`Role.VET`; (2) **auth do vet via JWT próprio** — a menção a Auth0 na PC-078 está desatualizada e não será seguida. Pendências para a sessão de arquitetura M5 / ADR-003 registradas (sujeito do JWT com duas tabelas, modelo de `nota_clinica` vs `veterinarianName` legado, vínculo vet↔pet do dashboard, sessão/estado no web). Correções de fatos: shared real é `@petcardorg/shared@0.8.0` (não `@petcard/shared@0.3.0` da issue) → release de M5 será `0.9.0`; `petcard-web` ainda consome `^0.7.0` e precisa alinhar.
