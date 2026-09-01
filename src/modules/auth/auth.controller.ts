import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CreateVeterinarioDto } from '@petcardorg/shared';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { Auth } from './decorators/auth.decorator';
import { Public } from './decorators/public.decorator';
import { Role } from './enums/role.enum';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { JwtPayload } from './strategies/jwt.strategy';

/**
 * Rotas sem sessão levam rate limit por IP: são a superfície de força bruta de
 * credenciais e de enumeração de contas cadastradas.
 *
 * O guard avalia TODOS os throttlers nomeados da configuração, não só o citado
 * no `@Throttle`. Sem dispensar o da carteira pública, o limite dela (bem mais
 * apertado) é que valeria aqui — por isso todo par vem com `@SkipThrottle`.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: {} })
  @SkipThrottle({ 'public-card': true })
  @ApiTooManyRequestsResponse({ description: 'Limite de tentativas excedido' })
  @ApiOperation({ summary: 'Registrar novo tutor' })
  @ApiConflictResponse({ description: 'Email já cadastrado' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: {} })
  @SkipThrottle({ 'public-card': true })
  @ApiTooManyRequestsResponse({ description: 'Limite de tentativas excedido' })
  @ApiOperation({ summary: 'Login do tutor (JWT com role TUTOR)' })
  @ApiUnauthorizedResponse({ description: 'Credenciais inválidas' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('google')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: {} })
  @SkipThrottle({ 'public-card': true })
  @ApiTooManyRequestsResponse({ description: 'Limite de tentativas excedido' })
  @ApiOperation({
    summary: 'Login/cadastro do tutor com Google (ID token)',
    description:
      'Valida o ID token do Google e vincula (ou cria) a conta do tutor. ' +
      'Conta criada por aqui nasce com o e-mail verificado.',
  })
  @ApiUnauthorizedResponse({ description: 'ID token inválido' })
  loginWithGoogle(@Body() dto: GoogleLoginDto) {
    return this.authService.googleLogin(dto);
  }

  @Post('password/forgot')
  @Public()
  @HttpCode(202)
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: {} })
  @SkipThrottle({ 'public-card': true })
  @ApiTooManyRequestsResponse({ description: 'Limite de tentativas excedido' })
  @ApiOperation({
    summary: 'Solicitar link de redefinição de senha',
    description:
      'Responde 202 exista ou não a conta — a rota não confirma quais ' +
      'e-mails estão cadastrados.',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto);
    return {
      message: 'Se houver uma conta com esse e-mail, o link foi enviado.',
    };
  }

  @Post('password/reset')
  @Public()
  @HttpCode(204)
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: {} })
  @SkipThrottle({ 'public-card': true })
  @ApiTooManyRequestsResponse({ description: 'Limite de tentativas excedido' })
  @ApiOperation({ summary: 'Redefinir a senha a partir do token do e-mail' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('email/verify')
  @Public()
  @HttpCode(204)
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: {} })
  @SkipThrottle({ 'public-card': true })
  @ApiTooManyRequestsResponse({ description: 'Limite de tentativas excedido' })
  @ApiOperation({ summary: 'Confirmar o e-mail a partir do token do link' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Post('email/resend')
  @Auth(Role.TUTOR)
  @HttpCode(202)
  @ApiOperation({ summary: 'Reenviar o e-mail de verificação ao tutor logado' })
  async resendVerification(@CurrentUser() user: JwtPayload) {
    await this.authService.resendVerification(user.sub);
    return { message: 'Verifique sua caixa de entrada.' };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Payload do JWT do usuário autenticado' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou inválido' })
  getProfile(@CurrentUser() user: JwtPayload): JwtPayload {
    return user;
  }

  @Post('veterinario/register')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: {} })
  @SkipThrottle({ 'public-card': true })
  @ApiTooManyRequestsResponse({ description: 'Limite de tentativas excedido' })
  @ApiOperation({
    summary: 'Cadastrar veterinário (JWT com role VET)',
    description:
      'O CRMV é validado na base externa durante o cadastro. Se o provedor ' +
      'estiver indisponível, a conta é criada mesmo assim como não ' +
      'verificada — veja `crmv_verificado` na resposta.',
  })
  @ApiConflictResponse({ description: 'Email ou CRMV já cadastrado' })
  registerVeterinario(@Body() dto: CreateVeterinarioDto) {
    return this.authService.registerVeterinario(dto);
  }

  @Post('veterinario/login')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: {} })
  @SkipThrottle({ 'public-card': true })
  @ApiTooManyRequestsResponse({ description: 'Limite de tentativas excedido' })
  @ApiOperation({ summary: 'Login do veterinário (JWT com role VET)' })
  @ApiUnauthorizedResponse({ description: 'Credenciais inválidas' })
  loginVeterinario(@Body() dto: LoginDto) {
    return this.authService.loginVeterinario(dto);
  }

  @Get('veterinario/profile')
  @Auth(Role.VET)
  @ApiOperation({ summary: 'Perfil do veterinário autenticado' })
  getVeterinarioProfile(@CurrentUser() user: JwtPayload) {
    return this.authService.getVeterinarioProfile(user.sub);
  }
}
