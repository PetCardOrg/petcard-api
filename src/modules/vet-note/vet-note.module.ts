import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VetNoteController } from './vet-note.controller';
import { VetNoteService } from './vet-note.service';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [VetNoteController],
  providers: [VetNoteService],
  exports: [VetNoteService],
})
export class VetNoteModule {}
