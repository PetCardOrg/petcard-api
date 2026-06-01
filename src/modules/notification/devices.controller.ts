import { Body, Controller, Post } from '@nestjs/common';
import { DeviceToken } from '@prisma/client';
import { RegisterDeviceDto } from '@petcardorg/shared';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { TutorService } from '../tutor/tutor.service';
import { NotificationService } from './notification.service';

@Controller('devices')
export class DevicesController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly tutorService: TutorService,
  ) {}

  @Post()
  @Auth(Role.TUTOR)
  async register(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RegisterDeviceDto,
  ): Promise<DeviceToken> {
    const tutor = await this.tutorService.findById(user.sub);
    return this.notificationService.registerDevice(tutor.id, dto);
  }
}
