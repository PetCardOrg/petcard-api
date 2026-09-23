import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TutorModule } from '../tutor/tutor.module';
import { VeterinarioModule } from '../veterinario/veterinario.module';
import { CardController } from './card.controller';
import { CardService } from './card.service';

@Module({
  imports: [AuthModule, TutorModule, VeterinarioModule],
  controllers: [CardController],
  providers: [CardService],
  exports: [CardService],
})
export class CardModule {}
