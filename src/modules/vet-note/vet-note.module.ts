import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { VetNoteController } from './vet-note.controller';
import { VetNoteService } from './vet-note.service';

@Module({
  imports: [forwardRef(() => AuthModule), NotificationModule],
  controllers: [VetNoteController],
  providers: [VetNoteService],
  exports: [VetNoteService],
})
export class VetNoteModule {}
