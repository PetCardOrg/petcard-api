import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../../prisma/prisma.module';
import { VeterinarioModule } from '../veterinario/veterinario.module';
import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { AuthWebController } from './auth-web.controller';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.get<string>('auth.jwtSecret')!,
        signOptions: {
          expiresIn: config.get<string>('auth.jwtExpiresIn') ?? '7d',
        } as JwtModuleOptions['signOptions'],
      }),
    }),
    PrismaModule,
    MailModule,
    // O cadastro de veterinário verifica o CRMV; o módulo de veterinário, por
    // sua vez, depende dos guards daqui. forwardRef resolve o ciclo.
    forwardRef(() => VeterinarioModule),
  ],
  controllers: [AuthController, AuthWebController],
  providers: [
    AuthService,
    AuthTokenService,
    JwtStrategy,
    RolesGuard,
    // Guards globais: toda rota HTTP exige autenticação + papel por padrão
    // (secure-by-default). A ordem importa — autenticar antes de autorizar.
    // Exceções explícitas via @Public(). Rotas com @Auth() também aplicam os
    // guards em nível de rota, o que mantém os testes de controller intactos.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, RolesGuard],
})
export class AuthModule {}
