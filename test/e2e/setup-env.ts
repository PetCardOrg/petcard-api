/**
 * Defaults de ambiente para a suíte E2E. São aplicados antes do boot do app
 * (via `setupFiles`) e antes de `prisma migrate deploy` (via `globalSetup`).
 * Tudo é definido só se ainda não houver valor, para o CI poder sobrescrever
 * `DATABASE_URL` apontando para o Postgres do service container.
 */
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??=
  'postgresql://petcard:petcard123@localhost:5432/petcard_test?schema=public';
process.env.JWT_SECRET ??= 'e2e-test-secret';
process.env.JWT_EXPIRES_IN ??= '1h';
// Chave AES-256-GCM válida (32 bytes em hex). Só usada em fluxos de OAuth.
process.env.ENCRYPTION_KEY ??= '0'.repeat(64);
process.env.RABBITMQ_URL ??= 'amqp://localhost:5672';
process.env.FCM_ENABLED ??= 'false';
