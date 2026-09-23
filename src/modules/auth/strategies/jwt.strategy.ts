import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { Role } from '../enums/role.enum';

export interface JwtPayload {
  sub: string;
  email?: string;
  role?: Role;
  /**
   * Carimbo (epoch em ms) da troca de senha vigente quando o token foi
   * emitido. Ausente quando a conta nunca trocou de senha.
   */
  pwd_at?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('auth.jwtSecret')!,
    });
  }

  /**
   * Além da assinatura e da validade, confere se a sessão ainda vale.
   *
   * O JWT é autocontido e dura 7 dias: sem uma checagem contra o banco, a
   * única forma de encerrar uma sessão seria esperar o token expirar. Quem
   * redefiniu a senha porque a conta foi invadida continuava com o invasor
   * dentro. A consulta é uma leitura por chave primária, o preço de ter
   * sessão revogável.
   *
   * O payload devolvido segue só com `sub`, `email` e `role` — `pwd_at` é
   * detalhe interno e não deve vazar em `GET /auth/profile`.
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const conta = await this.buscarConta(payload);

    // Conta apagada: o token sobreviveu ao dono. Antes disso, ele continuava
    // autenticando e só esbarrava num 404 lá adiante.
    if (!conta) {
      throw new UnauthorizedException('Sessão expirada. Entre novamente.');
    }

    // Comparação exata, não "anterior a": o token emitido junto com a troca
    // carrega o mesmo carimbo, e todos os demais carregam outro (ou nenhum).
    // Evita a janela de arredondamento de quem compara com o `iat`, que tem
    // resolução de segundos.
    if (
      (conta.passwordChangedAt?.getTime() ?? null) !== (payload.pwd_at ?? null)
    ) {
      throw new UnauthorizedException(
        'A senha desta conta mudou. Entre novamente.',
      );
    }

    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }

  private buscarConta(
    payload: JwtPayload,
  ): Promise<{ passwordChangedAt: Date | null } | null> {
    const select = { passwordChangedAt: true } as const;

    return payload.role === Role.VET
      ? this.prisma.veterinario.findUnique({
          where: { id: payload.sub },
          select,
        })
      : this.prisma.tutor.findUnique({ where: { id: payload.sub }, select });
  }
}
