import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { ColeiraController } from './coleira.controller';
import { ColeiraService } from './coleira.service';

@Module({
  imports: [AuthModule, NotificationModule],
  controllers: [ColeiraController],
  providers: [ColeiraService],
  exports: [ColeiraService],
})
export class ColeiraModule {}
