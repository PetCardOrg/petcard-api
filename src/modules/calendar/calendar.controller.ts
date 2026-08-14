import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiExcludeEndpoint,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { GoogleCalendarService } from './google-calendar.service';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

@ApiTags('calendar')
@Controller('calendar')
export class CalendarController {
  private readonly logger = new Logger(CalendarController.name);

  constructor(
    private readonly googleCalendarService: GoogleCalendarService,
    private readonly configService: ConfigService,
  ) {}

  @Get('connect')
  @Auth(Role.TUTOR)
  @ApiOperation({
    summary: 'Obter URL de autorização OAuth do Google Calendar',
  })
  connect(@CurrentUser() user: JwtPayload) {
    const url = this.googleCalendarService.getAuthUrl(user.sub);
    if (!url) {
      return {
        connected: false,
        message: 'Google Calendar integration is not configured',
      };
    }
    return { auth_url: url };
  }

  @Get('callback')
  @ApiOperation({
    summary: 'Callback OAuth do Google (redirecionamento do consentimento)',
  })
  @ApiQuery({ name: 'code', description: 'Código de autorização do Google' })
  @ApiQuery({ name: 'state', description: 'Id do tutor originador do fluxo' })
  @ApiQuery({
    name: 'error',
    required: false,
    description: 'Preenchido pelo Google quando o consentimento é negado',
  })
  async callback(
    @Query('code') code: string,
    @Query('state') tutorId: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    // Esta rota é o retorno do navegador: qualquer falha precisa virar página,
    // não um 500 com stack trace na cara do usuário.
    if (error) {
      this.logger.warn(`Consentimento negado no Google Calendar: ${error}`);
      res
        .status(HttpStatus.BAD_REQUEST)
        .send(
          this.renderCallbackPage(
            false,
            'Autorização não concluída',
            'Você não autorizou o acesso ao Google Agenda. Volte ao app e tente de novo se quiser conectar.',
          ),
        );
      return;
    }

    if (!code || !tutorId) {
      this.logger.warn(
        `Callback do Google Calendar sem parâmetros (code=${!!code}, state=${!!tutorId})`,
      );
      res
        .status(HttpStatus.BAD_REQUEST)
        .send(
          this.renderCallbackPage(
            false,
            'Link inválido',
            'Este endereço não veio de uma autorização válida do Google. Inicie a conexão pelo app.',
          ),
        );
      return;
    }

    try {
      await this.googleCalendarService.handleCallback(code, tutorId);
      res.send(
        this.renderCallbackPage(
          true,
          'Google Calendar conectado com sucesso!',
          'Pode fechar esta janela e voltar ao app.',
        ),
      );
    } catch (err) {
      this.logger.error(
        `Falha ao concluir o callback do Google Calendar (tutor ${tutorId})`,
        err instanceof Error ? err.stack : err,
      );
      res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .send(
          this.renderCallbackPage(
            false,
            'Não foi possível conectar',
            err instanceof Error
              ? err.message
              : 'Erro inesperado ao conectar o Google Agenda.',
          ),
        );
    }
  }

  private renderCallbackPage(
    ok: boolean,
    title: string,
    message: string,
  ): string {
    const accent = ok ? '#06A77D' : '#E63946';
    return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>PetCard - Google Calendar</title>
<style>
  body { font-family: system-ui; max-width: 480px; margin: 40px auto; padding: 0 20px; background: #F6FBFE; color: #14313F; }
  .card { background: #fff; border: 1px solid #D8EEF6; border-left: 4px solid ${accent}; border-radius: 12px; padding: 24px; }
  h2 { color: ${accent}; margin-top: 0; }
</style></head><body>
<div class="card"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p></div>
</body></html>`;
  }

  @Get('dev-connect')
  @ApiExcludeEndpoint()
  devConnect(@Res() res: Response) {
    if (this.configService.get('NODE_ENV') !== 'development') {
      res.status(404).send('Not found');
      return;
    }

    res.send(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>PetCard - Calendar Dev Connect</title>
<style>
  body { font-family: system-ui; max-width: 480px; margin: 40px auto; padding: 0 20px; background: #F6FBFE; color: #14313F; }
  h2 { color: #107FA8; }
  input, button { display: block; width: 100%; padding: 12px; margin: 8px 0; border-radius: 8px; border: 1px solid #D8EEF6; font-size: 15px; box-sizing: border-box; }
  button { background: #27A9D8; color: #fff; border: none; cursor: pointer; font-weight: 700; }
  button:hover { background: #107FA8; }
  .step { background: #fff; border: 1px solid #D8EEF6; border-radius: 12px; padding: 20px; margin: 16px 0; }
  .success { background: #E7F8F1; border-color: #06A77D; color: #06A77D; }
  .error { background: #FEF2F2; border-color: #E63946; color: #E63946; }
  #status { display: none; }
</style></head><body>
<h2>PetCard Calendar - Dev Connect</h2>
<div class="step">
  <p><strong>1.</strong> Faca login com sua conta do PetCard:</p>
  <input id="email" type="email" placeholder="Email" />
  <input id="password" type="password" placeholder="Senha" />
  <button onclick="login()">Entrar</button>
</div>
<div id="status" class="step"></div>
<script>
async function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const status = document.getElementById('status');
  status.style.display = 'block';
  status.className = 'step';
  status.innerHTML = 'Autenticando...';
  try {
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) { status.className = 'step error'; status.innerHTML = 'Login falhou. Verifique email/senha.'; return; }
    const data = await res.json();
    const token = data.access_token;
    status.innerHTML = 'Login OK! Buscando URL do Google Calendar...';
    const calRes = await fetch('/calendar/connect', { headers: { Authorization: 'Bearer ' + token } });
    const calData = await calRes.json();
    if (calData.auth_url) {
      status.className = 'step success';
      status.innerHTML = '<strong>2.</strong> Clique para conectar o Google Calendar:<br><br><a href="' + calData.auth_url + '" style="display:inline-block;background:#107FA8;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Conectar Google Calendar</a>';
    } else {
      status.className = 'step error';
      status.innerHTML = 'Google Calendar nao configurado no servidor.';
    }
  } catch(e) { status.className = 'step error'; status.innerHTML = 'Erro: ' + e.message; }
}
</script></body></html>`);
  }

  @Get('status')
  @Auth(Role.TUTOR)
  @ApiOperation({ summary: 'Status da conexão com o Google Calendar' })
  async status(@CurrentUser() user: JwtPayload) {
    const connected = await this.googleCalendarService.isConnected(user.sub);
    return { connected };
  }

  @Delete('disconnect')
  @Auth(Role.TUTOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Desconectar Google Calendar (remove tokens do tutor)',
  })
  async disconnect(@CurrentUser() user: JwtPayload) {
    await this.googleCalendarService.disconnect(user.sub);
  }

  @Post('sync')
  @Auth(Role.TUTOR)
  @ApiOperation({
    summary: 'Sincronizar compromissos pendentes com o Google Calendar',
  })
  async sync(@CurrentUser() user: JwtPayload) {
    const count = await this.googleCalendarService.syncAllPending(user.sub);
    return { synced: count };
  }
}
