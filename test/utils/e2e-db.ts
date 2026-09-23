/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Zera todas as tabelas de dados entre testes (preserva `_prisma_migrations`).
 * Um único `TRUNCATE ... CASCADE` resolve as dependências de FK.
 */
export async function resetDb(prisma: PrismaService): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;

  if (rows.length === 0) return;

  const tables = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`,
  );
}

export interface AuthedUser {
  token: string;
  user: { id: string; [key: string]: unknown };
}

/** Registra um tutor pelo endpoint real e devolve o JWT emitido. */
export async function registerTutor(
  app: INestApplication<App>,
  overrides: { name?: string; email?: string; password?: string } = {},
): Promise<AuthedUser> {
  const body = {
    name: overrides.name ?? 'Alice Tutora',
    email: overrides.email ?? 'tutor@petcard.com',
    // Precisa passar na regra de senha forte do RegisterDto (mobile#54).
    password: overrides.password ?? 'Senha123!',
  };

  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send(body)
    .expect(201);

  return { token: res.body.access_token as string, user: res.body.user };
}

/**
 * Cria um veterinário direto no banco (não há endpoint público de cadastro de
 * vet) e faz login pelo endpoint real para obter o JWT.
 *
 * Nasce com o CRMV verificado porque a maioria dos cenários quer o caminho
 * feliz; passe `crmvVerificado: false` para exercitar o bloqueio da api#113.
 */
export async function createAndLoginVet(
  app: INestApplication<App>,
  prisma: PrismaService,
  overrides: {
    nome?: string;
    email?: string;
    password?: string;
    crmv?: string;
    crmvVerificado?: boolean;
  } = {},
): Promise<AuthedUser> {
  const password = overrides.password ?? 'senha123';
  const verificado = overrides.crmvVerificado ?? true;
  await prisma.veterinario.create({
    data: {
      nome: overrides.nome ?? 'Dra. Camila',
      email: overrides.email ?? 'vet@petcard.com',
      crmv: overrides.crmv ?? 'CRMV-CE-1234',
      password: await bcrypt.hash(password, 10),
      crmvVerifiedAt: verificado ? new Date() : null,
      crmvSituacao: verificado ? 'Ativo' : null,
    },
  });

  const res = await request(app.getHttpServer())
    .post('/auth/veterinario/login')
    .send({ email: overrides.email ?? 'vet@petcard.com', password })
    .expect(201);

  return { token: res.body.access_token as string, user: res.body.user };
}

/**
 * Põe o pet na lista de atendidos do veterinário.
 *
 * Em produção o vínculo nasce da leitura do QR Code da carteira
 * (`POST /veterinarios/me/pets`) — é ele que autoriza o vet a abrir o
 * prontuário. Aqui é criado direto, no mesmo espírito de `createAndLoginVet`:
 * o cenário sob teste é o que vem depois do atendimento começar.
 */
export async function vincularPetAoVet(
  prisma: PrismaService,
  veterinarioId: string,
  petId: string,
): Promise<void> {
  await prisma.petAtendido.upsert({
    where: { veterinarioId_petId: { veterinarioId, petId } },
    create: { veterinarioId, petId },
    update: { ultimoAcessoEm: new Date() },
  });
}
