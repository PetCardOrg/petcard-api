import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CardController } from './card.controller';
import { CardService } from './card.service';

@Module({
  imports: [AuthModule],
  controllers: [CardController],
  providers: [CardService],
  exports: [CardService],
})
export class CardModule {}
