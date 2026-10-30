import { createHash, timingSafeEqual } from 'node:crypto';
import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ReminderTriggerService } from './reminder-trigger.service';

/** Resumo de tamanho fixo, para o `timingSafeEqual` aceitar qualquer entrada. */
const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Disparo externo dos lembretes diários (AUD API-02), chamado pelo workflow
 * `reminders.yml` do GitHub Actions. Sem JWT: quem autentica é o segredo
 * `REMINDERS_TRIGGER_SECRET` no cabeçalho `X-Reminders-Secret`. Fora do
 * Swagger por ser rota de operação, não de cliente.
 */
@ApiExcludeController()
@Controller('internal/reminders')
export class ReminderTriggerController {
  constructor(
    private readonly trigger: ReminderTriggerService,
    private readonly config: ConfigService,
  ) {}

  @Post('run')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  async run(@Headers('x-reminders-secret') secret?: string): Promise<void> {
    const expected = this.config.get<string>('reminder.triggerSecret');
    if (!expected) throw new NotFoundException();

    // Comparação em tempo constante: a diferença de tempo de um `===` deixaria
    // adivinhar o segredo um caractere por vez.
    if (!secret || !timingSafeEqual(digest(secret), digest(expected))) {
      throw new UnauthorizedException();
    }

    await this.trigger.runAll();
  }
}
