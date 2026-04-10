# PetCard API — Contexto para Claude Code

## Sobre o Projeto

PetCard é um TCC (Trabalho de Conclusão de Curso) que consiste em uma carteira digital de saúde para pets. A arquitetura é Multirepo com 5 repositórios sob a organização GitHub `PetCardOrg`.

## Repositórios

- **petcard-api** (este repo) — Backend NestJS (TypeScript)
- **petcard-web** — Painel do Veterinário (React.js + Vite)
- **petcard-mobile** — App do Tutor (React Native / Expo)
- **petcard-shared** — Pacote npm `@petcardorg/shared` (DTOs, Enums, Types)
- **petcard-docs** — Documentação e gestão central

## Equipe

- Álvaro Araújo
- Camila Martins
- Ricardo Temporal

## Stack Técnica (API)

- **Framework:** NestJS (TypeScript, strict mode)
- **ORM:** Prisma 6
- **Banco:** PostgreSQL
- **Autenticação:** Auth0 + JWT
- **Pacote compartilhado:** `@petcardorg/shared` via GitHub Packages
- **CI/CD:** GitHub Actions
- **Gerenciador de pacotes:** npm

## Arquitetura do petcard-api

```
src/
├── modules/              # Módulos de domínio (1 por agregado)
│   ├── auth/             # Auth0 + JWT (PC-027, PC-028)
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── strategies/   # JWT strategy
│   │   ├── guards/       # AuthGuard, RolesGuard
│   │   └── __tests__/
│   ├── pet/              # CRUD Pet
│   ├── health/           # Vacinas, Vermifugações, Medicações
│   ├── card/             # Carteira Digital + QR Code
│   └── ...
├── common/               # Cross-cutting concerns
│   ├── decorators/
│   ├── filters/
│   ├── interceptors/
│   ├── pipes/
│   └── middleware/
├── config/               # Configurações por ambiente
├── app.module.ts
└── main.ts
prisma/
├── schema.prisma
├── migrations/
└── seed.ts
```

## Convenções de Código

- **Linguagem do código:** Inglês (nomes de variáveis, classes, funções)
- **Comentários:** Podem ser em português
- **Strict mode:** `"strict": true` no tsconfig
- **Módulos NestJS:** Um módulo por domínio
- **Services:** Contêm lógica de negócio
- **Controllers:** Apenas roteiam (sem lógica de negócio)
- **DTOs:** Validados com class-validator
- **Testes:** Todo endpoint novo precisa de teste unitário no service
- **Banco de dados:** Toda alteração via Prisma Migrations, nunca SQL manual
- **Tabelas/colunas:** snake_case

## Convenções de Commit

Seguimos Conventional Commits:

```
feat(auth): implementa JWT strategy com Auth0
fix(pet): corrige validação de espécie no cadastro
test(auth): adiciona testes unitários do AuthService
chore(ci): configura workflow de lint
```

## Branches

- `main` — produção (protegida)
- `develop` — integração (protegida)
- Feature branches: `feature/PC-XXX-descricao-curta`

Sempre criar branches a partir de `develop`.

## Princípio YAGNI

Só criar pastas e instalar dependências quando a issue em andamento exigir. Não criar estrutura antecipadamente.

## Milestone Atual: M1 — MVP 1: Cadastro + Saúde Básica (Semana 3-6)

Issues do M1 neste repo:

- PC-027: Implementar módulo Auth (Auth0 + JWT strategy)
- PC-028: Implementar guards de autenticação e autorização (RBAC)
- PC-029: CRUD completo do módulo Tutor
- PC-030: CRUD completo do módulo Pet
- PC-031: CRUD módulo Vacina
- PC-032: CRUD módulo Vermifugação
- PC-033: CRUD módulo Medicação
- PC-034: Upload de imagens para AWS S3
- PC-035: Seed script com dados de teste
- PC-046: Criar migrations para tabelas do MVP 1
