import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthTokenPurpose } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;

/**
 * Emite e consome os tokens de uso único da verificação de e-mail e da
 * recuperação de senha.
 *
 * Só o SHA-256 do token vai para o banco (`tokenHash`); o valor em claro existe
 * apenas no link enviado por e-mail. Mesmo princípio da assinatura do `state`
 * do OAuth do Calendar: quem lê a tabela não consegue forjar um link válido.
 */
@Injectable()
export class AuthTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Gera um token novo para o tutor e invalida os anteriores do mesmo
   * propósito — um pedido de reset torna sem efeito o link pedido antes.
   */
  async issue(tutorId: string, purpose: AuthTokenPurpose): Promise<string> {
    const rawToken = randomBytes(32).toString('base64url');

    await this.prisma.$transaction([
      this.prisma.authToken.deleteMany({
        where: { tutorId, purpose, usedAt: null },
      }),
      this.prisma.authToken.create({
        data: {
          tutorId,
          purpose,
          tokenHash: this.hash(rawToken),
          expiresAt: new Date(Date.now() + this.ttlMs(purpose)),
        },
      }),
    ]);

    return rawToken;
  }

  /**
   * Valida o token e o marca como usado. Token inexistente, já usado ou
   * expirado cai na mesma resposta — sem dizer qual dos três foi.
   */
  async consume(rawToken: string, purpose: AuthTokenPurpose): Promise<string> {
    const record = await this.prisma.authToken.findUnique({
      where: { tokenHash: this.hash(rawToken) },
    });

    if (
      !record ||
      record.purpose !== purpose ||
      record.usedAt !== null ||
      record.expiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Link inválido ou expirado.');
    }

    await this.prisma.authToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    return record.tutorId;
  }

  private hash(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private ttlMs(purpose: AuthTokenPurpose): number {
    if (purpose === AuthTokenPurpose.PASSWORD_RESET) {
      return (
        this.config.get<number>('mail.resetTtlMinutes', 60) * MS_PER_MINUTE
      );
    }
    return (
      this.config.get<number>('mail.verificationTtlHours', 24) * MS_PER_HOUR
    );
  }
}
