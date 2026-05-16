# PetCard — Contexto para Claude Code (foco: Milestone 4 — Integrações Externas / API)

## Projeto

PetCard — carteira digital de saúde para pets. TCC do Ricardo Temporal.
Multirepo sob `PetCardOrg`:

- `petcard-api` (NestJS + Prisma + Postgres + Redis + S3) — **foco desta sessão**
- `petcard-mobile` (React Native + Expo)
- `petcard-web` (SPA Vite + React)
- `petcard-shared` (npm `@petcardorg/shared` no GitHub Packages)
- `petcard-docs` (ADRs, board centralizado, documentação)

**Equipe:** Álvaro Araújo (Backend), Camila Martins (DevOps/PM), Ricardo Temporal (Frontend Lead — vem atuando na API desde M2).

## Stack relevante

- **Backend:** NestJS, Prisma, PostgreSQL (PostGIS instalado mas sem uso após pivô para Google Places), Redis (no compose, ainda sem uso em código), AWS S3, RabbitMQ
- **Auth:** Auth0 (JWKS), roles `TUTOR` e `VET`
- **Decorators existentes:** `@CurrentUser`, `@Roles`, `@Auth`
- **Guards existentes:** `JwtAuthGuard`, `RolesGuard` (síncrono, role propagado pelo `JwtStrategy` — fonte única é `tutor.role` no banco)
- **Shared:** DTOs em `@petcardorg/shared`, versão atual `0.7.0` em api/mobile/web

## Status das milestones

- **M0** ✅ Setup, GitHub Packages, ADR-001 multirepo, project board, ferramental (ESLint/Prettier/Husky/CI) em todos os 5 repos
- **M1** ✅ Auth + CRUDs (Tutor, Pet, Vaccine, Deworming, Medication), upload S3, seed
- **M2** ✅ Carteira Digital + QR Code (fila com retry/DLQ)
- **M3** ✅ Geolocalização + Clínicas — entregue via Google Places API (`GET /clinicas/places`); tabela `clinica` local + PostGIS foi descartada
- **M4** 🚧 **Integrações Externas** — ver escopo abaixo

### Auditoria M0-M3 (2026-05-11) — fechada

As 8 recomendações de `audits/auditoria-completa-M0-M3-2026-05-11.md` foram endereçadas até 2026-05-14:

1. ✅ Índice GiST de `clinica.coordinates` (depois descartado junto com a tabela no pivô para Google Places)
2. ✅ `@petcardorg/shared` alinhado em `^0.7.0` nos 3 consumidores
3. ✅ Ferramental do `petcard-shared` (ESLint, Prettier, Husky, CI)
4. ✅ CI do `petcard-mobile` (lint + typecheck + expo-doctor)
5. ✅ Fonte única de role: `tutor.role` propagado via `request.user.role`
6. ✅ DLX/DLQ + retry no `qr-code.generate`
7. ✅ CORS allowlisted via `CORS_ORIGINS`; Auth0 sem fallback hardcoded no mobile
8. ✅ Higiene (LICENSE, no-explicit-any, coverageThreshold, docker-compose version, encoding, etc.)

## M4 — Integrações Externas

### Objetivo

Conectar a API a serviços externos que fecham o loop de produto sem o tutor precisar abrir o app:

- **Lembretes proativos** de próxima dose (vacina/vermífugo/medicação) chegando como **notificação push** no celular do tutor.
- **Agendamento de consultas** no **Google Calendar** do tutor, com lembrete nativo do calendário e visibilidade na rotina dele.

### Escopo (núcleo)

| #   | Integração                          | API role                                                                | Triggers / fluxo                                                                                                                                                                                                                                         |
| --- | ----------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Firebase Cloud Messaging (push)** | Outbound — envia push para device tokens do tutor                       | (a) cron diário consulta `vaccine/deworming/medication` onde `next_dose_at` está em janela X dias e ainda não foi notificado; (b) `POST /devices` registra/atualiza FCM token; (c) opcional: push em eventos imediatos (ex.: carteira pública acessada). |
| 2   | **Google Calendar (agenda)**        | Outbound com OAuth por tutor — cria/atualiza eventos na agenda do tutor | (a) novo endpoint `POST /appointments` cria evento no Calendar via OAuth tokens persistidos do tutor; (b) `GET /auth/google/connect` inicia fluxo OAuth; (c) refresh token armazenado server-side, criptografado.                                        |

### Fora de escopo nesta milestone (M5+)

- Webhooks de entrada (sistemas de clínica empurrando dados pra API).
- Email transacional (SendGrid/Resend) — usar push como canal único em M4.
- SMS (Twilio).
- Painel do veterinário no `petcard-web` (continua aguardando milestone própria).
- Hardening de produção (rate-limit global, helmet, payload size) — não é integração; entra em M5 se o cronograma permitir.

### Decisões de arquitetura M4 (fechadas em 2026-05-16)

Sessão de decisão com Ricardo em 2026-05-16. Detalhamento completo (motivação + alternativas rejeitadas) em `petcard-docs/architecture/adr/002-m4-integracoes-externas.md`.

1. **Trigger das notificações de próxima dose:** cron diário no fuso do tutor, varrendo `vaccine/deworming/medication` com `next_dose_at` na janela X dias e ainda não notificado. Idempotência via campo `last_notified_at` no model. Rejeitados: job-on-write (exige scheduler persistente) e híbrido (complexidade sem ganho).
2. **Modelo de device token:** tabela `device_token` com `id, tutorId, token (UNIQUE), platform, createdAt, lastSeenAt`. Relação 1:N tutor→tokens (multi-device). Soft-invalida tokens que o FCM retornar como não-registrados.
3. **Fila de saída para push:** RabbitMQ `notification.push` com DLX/DLQ + headers `x-retry-count`, reusando topologia da `qr-code.generate`. Cron só publica; worker (PC-068) chama FCM.
4. **Storage dos OAuth tokens do Google:** model `google_oauth_token` (`tutorId UNIQUE, accessToken encrypted, refreshToken encrypted, expiresAt, scopes[]`). Criptografia AES-256-GCM. `ENCRYPTION_KEY` em env separada — NUNCA reusar `JWT_SECRET`. Rotação documentada em ADR-002.
5. **Fuso horário:** coluna `tutor.timezone` (nullable, default `America/Fortaleza`), exposta em `PATCH /tutor/me`. Cron e Calendar leem este campo.
6. **Re-notificação:** 1 push por dose, sem retry no MVP. `last_notified_at` evita reenvio. Política mais agressiva (escalonado 7d/1d/0d) fica para M5+ se houver demanda.
7. **Falha do FCM/Google:** log ERROR + métrica + mensagem na DLQ. Request do tutor nunca falha por causa de integração externa, EXCETO `POST /auth/google/connect` (objetivo da request _é_ a integração — aí pode retornar 502).
8. **Credenciais Firebase em produção:** AWS Secrets Manager com carregamento no boot via IAM role do ECS Fargate (alinhado com PC-092). Dev usa arquivo local apontado em `.env`. Falha rápida no boot se o secret não puder ser lido.

### Padrões específicos da M4

- **Boundary de integração isolada.** Cada serviço externo vira um módulo (`NotificationModule`, `CalendarModule`) com um _client_ injetável e uma _facade_ que o resto da API consome. Trocar o provedor não vaza pro service de negócio.
- **Degradação graceful.** Falha do FCM/Google → log de ERROR + métrica + caminho de fallback (ex.: enfileirar pra retry). A request do tutor não falha por isso, salvo quando o objetivo da request _é_ a integração (ex.: `POST /auth/google/connect`).
- **Fila para todo outbound de volume.** Push e criação de evento no Calendar passam pela mesma topologia de DLX/DLQ usada em M2 (ver `RabbitMqTopologyService`). Sincronicidade só onde o tutor está esperando resposta imediata.
- **Secret hygiene.** `.env.example` recebe entradas novas (FCM service account JSON path, Calendar client ID/secret, encryption key) com placeholders óbvios. Nada hardcoded — `CORS_ORIGINS` e o ex-Auth0 do mobile (M0-#7) viraram o padrão; aplicar igual aqui.
- **OAuth flow do tutor.** O tutor já passou pelo Auth0; o Google Calendar é uma segunda camada de OAuth (delegação). Documentar em ADR-002 antes de mergear (linkar Auth0 ↔ Google).

## Padrões a seguir (independente do M4 escolhido)

- **Investigar antes de codar.** Ler módulos existentes (`PetService`, `TutorService`, `CardService`, `QueueModule`) antes de propor arquitetura nova. Reutilizar padrões de module/controller/service/dto.
- **DTOs no `@petcardorg/shared`.** Toda request/response nova vai como DTO no shared, com bump minor + publish. Atualizar consumidores (api/mobile/web) na mesma PR ou em PR encadeada.
- **Testes.** Unit para o service (mockando Prisma e clientes externos), e2e para endpoints novos. Manter `coverageThreshold` global em `package.json` (40/30/45/40 hoje — subir floor conforme cobertura melhora).
- **Migrations.** `npx prisma migrate dev --name <descricao_snake_case>`. Para SQL fora do que o Prisma cobre, `--create-only` + edição manual.
- **Auth.** Usar `@Auth()` + `@Roles(Role.VET)` ou `Role.TUTOR`; recuperar usuário via `@CurrentUser()` — nunca ler claim JWT direto em controller.
- **RBAC.** Fonte única é `tutor.role` no banco, propagado em `request.user.role` pelo `JwtStrategy`. Não reintroduzir leitura do claim `permissions`.
- **Filas.** Toda nova fila precisa de DLX/DLQ + retry — seguir o padrão de `qr-code.generate` (ver `RabbitMqTopologyService` + headers `x-retry-count`).
- **Configuração.** Variáveis sensíveis em `.env` (com entrada no `.env.example`). Nada de fallback hardcoded. Em produção, faltar variável crítica = falha rápida no boot (ver `CORS_ORIGINS`).

## Convenções gerais

- **Branches:** `feat/pc-XXX-descricao`, `fix/pc-XXX-...`, `chore/...`
- **Commits:** Conventional Commits (`feat(notif): add fcm token registration endpoint`)
- **PRs:** título `feat: PC-XXX - Descrição`, com checklist de DoD na descrição
- **DTOs compartilhados:** sempre em `@petcardorg/shared`, com bump minor para nova feature, patch para fix de tipo
- **ADRs:** decisões arquiteturais relevantes documentadas em `petcard-docs/architecture/adr/` antes de mergear

## Princípios de trabalho

- **YAGNI.** Sem cache, sem fila, sem abstrações sem demanda real. Se Redis entrar em M4, que seja por uso concreto — não "porque está no compose".
- **Reutilizar antes de criar.** Antes de novo service/util, procurar equivalente em `petcard-api` e `@petcardorg/shared`.
- **Falha de serviço externo não derruba a API.** Google, Firebase, S3, Auth0 — todos têm caminho de degradação previsto. Ver como o `places.service`/`geocoding.service` lidam hoje.
- **Validação na borda.** `ValidationPipe` global + `class-validator` em todos os DTOs de entrada. Confiar em código interno.
- **Atualizar `@petcardorg/shared` exige bump + publish** (workflow `publish.yaml` no shared).

## Escopo fora desta sessão (não fazer agora)

- Webhooks de entrada, email transacional, SMS, painel vet web, hardening de produção (ver "Fora de escopo nesta milestone" acima)
- Refactors amplos não relacionados a Firebase/Calendar
- Substituir libs já estabelecidas (NestJS, Prisma, Auth0, etc.)
- Reintroduzir tabela `clinica` local + PostGIS (descartado em 2026-05-12)
- M5+ — não definido ainda

## Ambiente de desenvolvimento

- Codespace do `petcard-api` com `petcard-shared` e `petcard-mobile` clonados ao lado em `/workspaces/`
- Docker Compose em `docker/docker-compose.yml` (postgis/postgis:16-3.4, redis:7-alpine, rabbitmq:3-management-alpine)
- Mobile precisa `export NODE_AUTH_TOKEN=$GITHUB_TOKEN` para resolver `@petcardorg/shared`
- API obriga `CORS_ORIGINS` em produção; em dev usa defaults de localhost (Vite :5173, API :3000, Expo :8081/:19006)

## Comandos úteis

```bash
# Subir ambiente
docker compose -f docker/docker-compose.yml up -d
npm run start:dev

# Migrations
npx prisma migrate status
npx prisma migrate dev --name <descricao>
npx prisma migrate dev --create-only --name <descricao>  # para editar SQL antes de aplicar

# Testes
npm test                  # unit
npm run test:cov          # com coverage (respeita coverageThreshold)
npm run test:e2e          # e2e

# Seed
npm run db:seed

# Fila — limpar fila com args divergentes antes de redeploy
docker exec petcard-rabbitmq rabbitmqctl delete_queue qr-code.generate

# Listar issues da M4
gh issue list --repo PetCardOrg/petcard-api --label "M4 - Integracoes Externas" --state all

# Smoke do FCM (depois do módulo de notificação existir)
curl -X POST http://localhost:3000/devices -H "Authorization: Bearer $TOKEN" \
  -d '{"token":"<fcm-token>","platform":"ios"}'

# Iniciar fluxo OAuth Google Calendar (depois de implementado)
open http://localhost:3000/auth/google/connect
```

## Última atualização

2026-05-16 — decisões de arquitetura M4 (#1-#8) fechadas em sessão com Ricardo; ver lista numerada acima e ADR-002 (`petcard-docs/architecture/adr/002-m4-integracoes-externas.md`). Próximo passo: abrir PC-072 (migrations) seguindo a ordem PC-072 → PC-066 → PC-068 → PC-067 → PC-064 → PC-069 → PC-065.
