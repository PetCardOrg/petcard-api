# 🐾 PetCard API

[![CI](https://github.com/PetCardOrg/petcard-api/actions/workflows/ci.yml/badge.svg)](https://github.com/PetCardOrg/petcard-api/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Backend do ecossistema PetCard. API REST construída com NestJS para gestão inteligente da saúde de animais de estimação.

**Projeto de TCC** — Ciência da Computação (2026)

## Ecossistema PetCard

Este repositório faz parte de um conjunto de 5 repos:

| Repositório                                                    | Descrição                          |
| -------------------------------------------------------------- | ---------------------------------- |
| **petcard-api**                                                | ← Você está aqui                   |
| [petcard-web](https://github.com/PetCardOrg/petcard-web)       | Painel do Veterinário (React.js)   |
| [petcard-mobile](https://github.com/PetCardOrg/petcard-mobile) | App do Tutor (React Native / Expo) |
| [petcard-shared](https://github.com/PetCardOrg/petcard-shared) | DTOs e tipos compartilhados        |
| [petcard-docs](https://github.com/PetCardOrg/petcard-docs)     | Documentação e gestão do projeto   |

## Stack

| Camada         | Tecnologia                   |
| -------------- | ---------------------------- |
| Framework      | NestJS 10 + Node.js 20 LTS   |
| Linguagem      | TypeScript 5.x (strict mode) |
| Banco de Dados | PostgreSQL 16 + PostGIS 3.4  |
| ORM            | Prisma 6                     |
| Cache          | Redis 7                      |
| Fila           | RabbitMQ 3                   |
| Autenticação   | Auth0 (OAuth 2.0 + JWT)      |
| Storage        | AWS S3                       |
| Notificações   | Firebase Cloud Messaging     |

## Pré-requisitos

- Node.js >= 20 LTS
- npm >= 10
- Docker e Docker Compose
- GitHub Personal Access Token com escopo `read:packages` (para baixar `@petcardorg/shared` do GitHub Packages)

## Instalação

```bash
# 1. Clone o repositório
git clone https://github.com/PetCardOrg/petcard-api.git
cd petcard-api

# 2. Autentique no GitHub Packages (necessário para @petcardorg/shared)
# Crie um token em https://github.com/settings/tokens com escopo read:packages
export NODE_AUTH_TOKEN=<seu_personal_access_token>

# 3. Instale as dependências
npm install

# 4. Configure as variáveis de ambiente
cp .env.example .env
# Os defaults já casam com o docker-compose local; edite só credenciais externas
# (AWS, Firebase, Google) se for usar esses serviços.

# 5. Suba os serviços de infraestrutura
docker compose -f docker/docker-compose.yml up -d

# 6. Execute as migrations do banco
npx prisma migrate dev

# 7. (Opcional) Popule o banco com dados de exemplo
npm run db:seed

# 8. Inicie o servidor
npm run start:dev
# API disponível em http://localhost:3000
```

## Scripts

| Comando             | Descrição                              |
| ------------------- | -------------------------------------- |
| `npm run start:dev` | Inicia em modo desenvolvimento (watch) |
| `npm run build`     | Build de produção                      |
| `npm run test`      | Executa testes unitários               |
| `npm run test:e2e`  | Executa testes end-to-end              |
| `npm run test:cov`  | Relatório de cobertura                 |
| `npm run lint`      | Executa ESLint                         |

## Infraestrutura Local (Docker)

O `docker-compose.yml` sobe os seguintes serviços:

| Serviço              | Porta                    | Credenciais          |
| -------------------- | ------------------------ | -------------------- |
| PostgreSQL + PostGIS | 5432                     | petcard / petcard123 |
| Redis                | 6379                     | —                    |
| RabbitMQ             | 5672 (AMQP) / 15672 (UI) | petcard / petcard123 |

## Contribuição

Leia o [CONTRIBUTING.md](https://github.com/PetCardOrg/petcard-docs/blob/main/CONTRIBUTING.md) no repositório petcard-docs.
