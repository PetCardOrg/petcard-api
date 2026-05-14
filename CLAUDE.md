# PetCard — Contexto para Claude Code (foco: Milestone 3 / API)

## Projeto

PetCard — carteira digital de saúde para pets. TCC do Ricardo Temporal.
Multirepo sob `PetCardOrg`:

- `petcard-api` (NestJS + Prisma + Postgres + Redis + S3) — **foco desta sessão**
- `petcard-mobile` (React Native + Expo)
- `petcard-web` (SPA)
- `petcard-shared` (npm `@petcardorg/shared` no GitHub Packages)
- `petcard-docs` (ADRs, board centralizado, documentação)

**Equipe:** Álvaro Araújo (Backend), Camila Martins (DevOps/PM), Ricardo Temporal (Frontend Lead — atuando na API nesta milestone).

## Stack relevante

- **Backend:** NestJS, Prisma, PostgreSQL **com extension PostGIS** (presumido — confirmar no banco), Redis, AWS S3
- **Auth:** Auth0 (JWKS), roles `TUTOR` e `VET`
- **Decorators existentes:** `@CurrentUser`, `@Roles`, `@Auth`
- **Guards existentes:** `JwtAuthGuard`, `RolesGuard`
- **Shared:** DTOs em `@petcardorg/shared` (versão atual a confirmar no `package.json`)

## Status das milestones

- **M0** ✅ Setup, GitHub Packages, ADR-001 multirepo, project board
- **M1** ✅ Auth + CRUDs (Tutor, Pet, Vaccine, Deworming, Medication), upload S3, seed
- **M2** ✅/🚧 Carteira Digital + QR Code (auditar antes de mergulhar em M3)
- **M3** 🚧 Geolocalização + Clínicas — **foco atual**
- **M4+** 📋 Não definido

## M3 — Geolocalização + Clínicas

> ⚠️ **Atualização (2026-05-12):** a abordagem de tabela `clinica` local + PostGIS (`ST_DWithin`/`ST_Distance`, `$queryRaw`, índice GiST) foi **descartada**. A busca de clínicas passou a ser feita exclusivamente via **Google Places API** (`GET /clinicas/places`). Foram removidos: tabela `clinica` (migration `20260512130000_drop_clinica_table`), `ClinicaService`, endpoint `GET /clinicas`, bloco de seed de clínicas e os DTOs `ClinicaResponseDto` / `FindNearbyClinicsQueryDto` (shared `0.7.0`). As seções abaixo que falam de PostGIS/`ST_DWithin` ficam só como registro histórico — a extensão PostGIS continua instalada no banco, mas sem uso.

### Objetivo

Tutor abre o app, vê clínicas próximas no mapa, filtra por especialidade/avaliação/distância, e liga direto da tela. A API expõe busca geoespacial via PostGIS.

### Pré-requisito já entregue

- **PC-062** ✅ Migration: tabela `clinica` com coluna do tipo `GEOGRAPHY`
  - Presunção: PostGIS instalado como extension no **mesmo banco** da API. Confirmar com `SELECT PostGIS_Version();` antes de codar.

### Issues — ordem de execução para a API

| #   | Código | Título                                                   | Repo        | Por quê nesta posição                                                                                                                         |
| --- | ------ | -------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | PC-063 | Seed de clínicas com coordenadas reais                   | petcard-api | Sem dados no banco, nada de busca/filtro pode ser validado. Bloqueia tudo abaixo.                                                             |
| 2   | PC-057 | Módulo Geo: busca de clínicas com `ST_DWithin`           | petcard-api | Núcleo da M3. Sem o endpoint de busca por raio, filtros e mapa não têm o que consumir.                                                        |
| 3   | PC-058 | Filtros de clínica (especialidade, avaliação, distância) | petcard-api | Depende do endpoint de busca já funcionando. Estende com query params.                                                                        |
| 4   | PC-059 | Integração com Google Maps API (geocoding)               | petcard-api | Camada de enriquecimento (converter endereço digitado → lat/lng). Funciona sobre busca pronta — não é bloqueante para os primeiros endpoints. |

### Issues fora do escopo desta sessão (mobile)

- **PC-060** — Tela de busca de clínicas com mapa interativo (mobile)
- **PC-061** — Filtros e chamada telefônica direta (mobile)

Não codar essas agora. Mas: ao desenhar os endpoints (PC-057, PC-058), considere que o **mobile vai consumir** — campos retornados, paginação, formato de coordenadas devem ser pensados para o app, não só para curl.

### Decisões de arquitetura a tomar (antes de codar PC-057)

Estas decisões precisam estar resolvidas antes de implementar — pergunte ao Ricardo se faltar contexto, não invente:

1. **Formato do payload de busca:** query params (`GET /clinicas?lat=...&lng=...&radius=5000`) ou body em POST? Preferência REST: GET com query params.
2. **Unidade do raio:** metros (default do PostGIS com `geography`) ou quilômetros? Recomendado: metros na API, mobile converte para exibir.
3. **Ordenação:** sempre por distância crescente, ou configurável?
4. **Paginação:** offset/limit ou cursor? Para listas geográficas, offset/limit costuma bastar.
5. **Distância retornada:** API devolve `distanceMeters` em cada clínica (calculado via `ST_Distance`)? Mobile precisa disso pra exibir "1.2 km".
6. **Cache:** Redis para resultados de busca? Não recomendado no MVP (geolocalização do usuário muda muito) — YAGNI.
7. **Rate limit do Google Maps:** quem chama o geocoding — backend (recomendado, esconde a chave) ou frontend? Se backend, considerar cache de geocodings repetidos.

### Decisões já fixadas

- **PostgreSQL + PostGIS no mesmo banco** (presumido — verificar)
- **Coluna `GEOGRAPHY`** no schema (não `GEOMETRY`) — escolha correta para distâncias em metros sobre superfície terrestre
- **`ST_DWithin`** como operador de busca (usa índice GIST eficientemente)

### Schema esperado (referência, confirmar no `schema.prisma`)

```
clinica
├── id              UUID
├── nome            String
├── endereco        String
├── telefone        String?
├── especialidades  String[]   ou tabela auxiliar (a confirmar)
├── avaliacao       Float?     (média de reviews — origem? campo manual no seed?)
├── localizacao     Unsupported("geography(Point, 4326)")
└── createdAt/updatedAt
```

Prisma **não suporta nativamente** `geography`. Soluções comuns:

- `Unsupported("geography(Point, 4326)")` no schema + queries `$queryRaw` para `ST_DWithin`/`ST_Distance`
- Plugin `prisma-extensions-postgis` (avaliar se vale a dependência)

**Recomendação YAGNI:** começar com `Unsupported` + `$queryRaw` em métodos específicos do `ClinicaService`. Encapsular o SQL raw num único método para não espalhar.

## Padrões a seguir nesta milestone

- **Investigar antes de codar.** Antes de PC-057, ler como `PetService`/`TutorService` estão estruturados e seguir o mesmo padrão de module/controller/service/dto.
- **DTOs no `@petcardorg/shared`.** Toda resposta nova de clínica vai como DTO no shared, com bump de versão minor e publish.
- **Testes:** unit para o service (mockando Prisma), e2e para o endpoint de busca cobrindo ao menos: raio válido, raio sem resultados, lat/lng inválidos.
- **Migrations:** `npx prisma migrate dev --name <descricao_snake_case>`. Para alterações que envolvem PostGIS (ex.: criar índice GIST), pode ser necessário SQL manual via `prisma migrate dev --create-only` + edição.
- **Seed:** PC-063 deve usar coordenadas reais (Fortaleza ou cidade de teste). Não usar lat/lng inventados — quebra a percepção de busca durante demo do TCC.

## Convenções gerais

- **Branches:** `feat/pc-XXX-descricao`, `fix/pc-XXX-...`, `chore/...`
- **Commits:** Conventional Commits (`feat(clinica): add geo search endpoint`)
- **PRs:** título `feat: PC-XXX - Descrição`, com checklist de DoD na descrição
- **DTOs compartilhados:** sempre em `@petcardorg/shared`, com bump minor para nova feature
- **ADRs:** decisões arquiteturais relevantes (ex.: usar `$queryRaw` vs plugin Prisma) documentadas em `petcard-docs/adrs/` antes de mergear

## Princípios de trabalho

- **YAGNI.** Sem cache, sem fila, sem abstrações sem demanda real.
- **Reutilizar antes de criar.** Antes de novo service/util, procurar equivalente em `petcard-api` e `@petcardorg/shared`.
- **Investigar antes de codar.** Sempre ler o módulo existente antes de propor arquitetura.
- **Falha de Google Maps não quebra a API.** Se o geocoding falhar, retornar erro graceful — não derrubar o endpoint de busca.
- **Coordenadas vêm validadas.** `ValidationPipe` + `class-validator` em todos os query params (`@IsLatitude`, `@IsLongitude`, `@IsInt @Min(...)` no raio).
- **Atualizar `@petcardorg/shared` exige bump + publish** (workflow em `.github/workflows/`).

## Escopo fora desta sessão (não fazer agora)

- PC-060, PC-061 (mobile)
- Qualquer coisa fora de M3 (M2 já fechada/em revisão; M4+ não definida)
- Refactors amplos não relacionados a clínicas
- Substituir libs já estabelecidas
- Funcionalidade de reviews/avaliação (se `avaliacao` for campo manual por enquanto, não construir sistema de reviews aqui)

## Ambiente de desenvolvimento

- Codespace do `petcard-api` com `petcard-shared` e `petcard-mobile` clonados ao lado em `/workspaces/`
- Docker Compose em `docker/docker-compose.yml`
- **Confirmar imagem do Postgres no compose** — para PostGIS funcionar, a imagem precisa ser `postgis/postgis:<versão>` em vez de `postgres:<versão>`. Se ainda for postgres puro, PC-062 não roda.
- Mobile precisa `export NODE_AUTH_TOKEN=$GITHUB_TOKEN` para resolver `@petcardorg/shared`

## Checklist antes de começar PC-063

- [ ] Confirmar que `SELECT PostGIS_Version();` retorna versão (PostGIS instalado)
- [ ] Confirmar que migration de PC-062 foi aplicada (`npx prisma migrate status`)
- [ ] Confirmar índice GIST na coluna `localizacao` (sem ele, busca por raio é table scan e mata performance no demo)
  - Se faltar: `CREATE INDEX clinica_localizacao_idx ON clinica USING GIST (localizacao);`
- [ ] Decidir cidade do seed (Fortaleza recomendado pelo contexto do Ricardo)
- [ ] Decidir 5-15 clínicas reais ou fictícias com coordenadas plausíveis
- [ ] Verificar se já existe seed estruturado em `prisma/seed.ts` (M1) e estender, não duplicar

## Comandos úteis

```bash
# Subir ambiente
docker compose -f docker/docker-compose.yml up -d
npm run start:dev

# Verificar PostGIS no banco
docker exec -it $(docker ps --filter name=postgres -q) \
  psql -U <user> -d <db> -c "SELECT PostGIS_Version();"

# Migrations
npx prisma migrate status
npx prisma migrate dev --name <descricao>
npx prisma migrate dev --create-only --name <descricao>  # para editar SQL antes de aplicar

# Seed
npm run seed   # ou o comando real do package.json (db:seed?)

# Listar issues M3 da API
gh issue list --repo PetCardOrg/petcard-api \
  --label "M3 - Geolocalizacao + Clinicas" --state all

# Testar busca por raio (depois de PC-057)
curl "http://localhost:3000/clinicas?lat=-3.7172&lng=-38.5433&radius=5000"
```

## Última atualização

Gerado por Claude Code para iniciar a Milestone 3.
