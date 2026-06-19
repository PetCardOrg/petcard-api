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
    password: overrides.password ?? 'senha123',
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
 */
export async function createAndLoginVet(
  app: INestApplication<App>,
  prisma: PrismaService,
  overrides: {
    nome?: string;
    email?: string;
    password?: string;
    crmv?: string;
  } = {},
): Promise<AuthedUser> {
  const password = overrides.password ?? 'senha123';
  await prisma.veterinario.create({
    data: {
      nome: overrides.nome ?? 'Dra. Camila',
      email: overrides.email ?? 'vet@petcard.com',
      crmv: overrides.crmv ?? 'CRMV-CE-1234',
      password: await bcrypt.hash(password, 10),
    },
  });

  const res = await request(app.getHttpServer())
    .post('/auth/veterinario/login')
    .send({ email: overrides.email ?? 'vet@petcard.com', password })
    .expect(201);

  return { token: res.body.access_token as string, user: res.body.user };
}
