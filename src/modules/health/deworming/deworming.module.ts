import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PetModule } from '../../pet/pet.module';
import { DewormingController } from './deworming.controller';
import { DewormingService } from './deworming.service';

@Module({
  imports: [AuthModule, PetModule],
  controllers: [DewormingController],
  providers: [DewormingService],
})
export class DewormingModule {}
