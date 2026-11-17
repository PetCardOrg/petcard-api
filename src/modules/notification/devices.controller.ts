import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DeviceToken } from '@prisma/client';
import { RegisterDeviceDto, Role } from '@petcardorg/shared';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { TutorService } from '../tutor/tutor.service';
import { NotificationService } from './notification.service';

@ApiTags('devices')
@Controller('devices')
export class DevicesController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly tutorService: TutorService,
  ) {}

  @Post()
  @Auth(Role.TUTOR)
  @ApiOperation({
    summary: 'Registrar token de device do tutor para push (FCM)',
  })
  async register(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RegisterDeviceDto,
  ): Promise<DeviceToken> {
    const tutor = await this.tutorService.findById(user.sub);
    return this.notificationService.registerDevice(tutor.id, dto);
  }

  @Delete(':token')
  @Auth(Role.TUTOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Descadastrar token de device do tutor (logout)',
    description:
      'Só remove token do próprio tutor. Idempotente: responde 204 mesmo ' +
      'se o token não existe. O token vai na rota com encodeURIComponent.',
  })
  async unregister(
    @CurrentUser() user: JwtPayload,
    @Param('token') token: string,
  ): Promise<void> {
    await this.notificationService.unregisterDevice(user.sub, token);
  }
}
