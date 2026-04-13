import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TutorController } from './tutor.controller';
import { TutorService } from './tutor.service';

@Module({
  imports: [AuthModule],
  controllers: [TutorController],
  providers: [TutorService],
  exports: [TutorService],
})
export class TutorModule {}
