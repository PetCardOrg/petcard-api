import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate limit por usuário em vez de por IP, para rotas autenticadas.
 *
 * Numa rede compartilhada (o Wi-Fi de uma apresentação, a NAT de uma
 * operadora) todo mundo sai pelo mesmo IP, e o teto de um vira o de todos.
 * Com sessão, o `sub` do token identifica quem está enviando. O
 * `JwtAuthGuard` global roda antes e preenche `req.user`; sem ele, cai no IP.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: {
    user?: { sub?: string };
    ip?: string;
  }): Promise<string> {
    return Promise.resolve(req.user?.sub ?? req.ip ?? '');
  }
}
