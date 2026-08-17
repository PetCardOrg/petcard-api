import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { VeterinarioModule } from '../veterinario/veterinario.module';
import { VetNoteController } from './vet-note.controller';
import { VetNoteService } from './vet-note.service';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    NotificationModule,
    VeterinarioModule,
  ],
  controllers: [VetNoteController],
  providers: [VetNoteService],
  exports: [VetNoteService],
})
export class VetNoteModule {}
