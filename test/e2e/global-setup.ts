import { execSync } from 'child_process';
import './setup-env';

/**
 * Aplica as migrations no banco de teste antes de qualquer suíte E2E rodar.
 * Idempotente: `migrate deploy` não recria migrations já aplicadas.
 */
export default function globalSetup(): void {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: process.env,
  });
}
