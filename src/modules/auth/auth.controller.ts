import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Auth } from './decorators/auth.decorator';
import { Role } from './enums/role.enum';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { JwtPayload } from './strategies/jwt.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Registrar novo tutor' })
  @ApiConflictResponse({ description: 'Email já cadastrado' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login do tutor (JWT com role TUTOR)' })
  @ApiUnauthorizedResponse({ description: 'Credenciais inválidas' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Payload do JWT do usuário autenticado' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou inválido' })
  getProfile(@CurrentUser() user: JwtPayload): JwtPayload {
    return user;
  }

  @Post('veterinario/login')
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
