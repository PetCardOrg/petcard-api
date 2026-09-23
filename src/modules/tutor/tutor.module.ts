import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UploadModule } from '../upload/upload.module';
import { TutorController } from './tutor.controller';
import { TutorService } from './tutor.service';

@Module({
  imports: [forwardRef(() => AuthModule), UploadModule],
  controllers: [TutorController],
  providers: [TutorService],
  exports: [TutorService],
})
export class TutorModule {}
