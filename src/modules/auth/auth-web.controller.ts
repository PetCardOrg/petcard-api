import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { isStrongPassword } from '../../common/crypto/password.validators';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { resetFormPage, resultPage } from './auth-web.pages';

/**
 * Páginas abertas pelo navegador a partir dos links dos e-mails de auth
 * (mobile#54). São `GET`/`POST` que respondem HTML — não fazem parte da API
 * consumida pelo app, por isso ficam fora do Swagger.
 *
 * A CSP global da API é `script-src 'self'` e `form-action 'none'`; estas
 * páginas precisam de um `<script>` inline (regras + botão de olho) e de um
 * `POST` de formulário, então a CSP é afrouxada por resposta, com `nonce`.
 */
@ApiExcludeController()
@Controller('auth')
export class AuthWebController {
  constructor(private readonly authService: AuthService) {}

  @Get('verify-email')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: {} })
  @SkipThrottle({ 'public-card': true })
  async verifyEmail(@Query('token') token: string, @Res() res: Response) {
    try {
      await this.authService.verifyEmail({ token: token ?? '' });
      this.sendPage(
        res,
        200,
        resultPage(
          true,
          'E-mail confirmado!',
          'Sua conta está ativada. Pode voltar ao app PetCard.',
        ),
      );
    } catch {
      this.sendPage(
        res,
        400,
        resultPage(
          false,
          'Link inválido ou expirado',
          'Peça um novo e-mail de confirmação no app, na tela inicial.',
        ),
      );
    }
  }

  @Get('reset-password')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: {} })
  @SkipThrottle({ 'public-card': true })
  resetPasswordForm(@Query('token') token: string, @Res() res: Response) {
    if (!token) {
      this.sendPage(
        res,
        400,
        resultPage(
          false,
          'Link inválido',
          'Este endereço não tem um código de redefinição. Peça um novo no app.',
        ),
      );
      return;
    }
    const nonce = randomBytes(16).toString('base64');
    this.sendPage(res, 200, resetFormPage(token, nonce), nonce);
  }

  @Post('reset-password')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: {} })
  @SkipThrottle({ 'public-card': true })
  async resetPasswordSubmit(
    @Body() body: { token?: string; password?: string; confirm?: string },
    @Res() res: Response,
  ) {
    const { token, password, confirm } = body;

    if (!token || !isStrongPassword(password) || password !== confirm) {
      if (token) {
        const nonce = randomBytes(16).toString('base64');
        this.sendPage(res, 400, resetFormPage(token, nonce), nonce);
      } else {
        this.sendPage(
          res,
          400,
          resultPage(
            false,
            'Link inválido',
            'Peça uma nova redefinição no app.',
          ),
        );
      }
      return;
    }

    try {
      await this.authService.resetPassword({ token, password });
      this.sendPage(
        res,
        200,
        resultPage(
          true,
          'Senha alterada!',
          'Volte ao app PetCard e entre com a nova senha.',
        ),
      );
    } catch (error) {
      const expired = error instanceof BadRequestException;
      this.sendPage(
        res,
        400,
        resultPage(
          false,
          expired ? 'Link expirado' : 'Não foi possível redefinir',
          expired
            ? 'Este link de redefinição já foi usado ou passou da validade. Peça um novo no app.'
            : 'Erro inesperado. Tente novamente pelo app.',
        ),
      );
    }
  }

  /** Envia HTML com uma CSP própria (a global bloqueia script inline e form). */
  private sendPage(
    res: Response,
    status: number,
    html: string,
    scriptNonce?: string,
  ): void {
    const scriptSrc = scriptNonce ? `'nonce-${scriptNonce}'` : "'none'";
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'none'; style-src 'unsafe-inline'; script-src ${scriptSrc}; ` +
        `form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
    );
    res.status(status).type('text/html; charset=utf-8').send(html);
  }
}
