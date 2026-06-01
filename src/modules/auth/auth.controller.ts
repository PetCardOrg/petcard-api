import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Auth } from './decorators/auth.decorator';
import { Role } from './enums/role.enum';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { JwtPayload } from './strategies/jwt.strategy';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@CurrentUser() user: JwtPayload): JwtPayload {
    return user;
  }

  @Post('veterinario/login')
  loginVeterinario(@Body() dto: LoginDto) {
    return this.authService.loginVeterinario(dto);
  }

  @Get('veterinario/profile')
  @Auth(Role.VET)
  getVeterinarioProfile(@CurrentUser() user: JwtPayload) {
    return this.authService.getVeterinarioProfile(user.sub);
  }
}
