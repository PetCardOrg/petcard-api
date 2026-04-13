import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TutorModule } from '../tutor/tutor.module';
import { PetController } from './pet.controller';
import { PetService } from './pet.service';

@Module({
  imports: [AuthModule, TutorModule],
  controllers: [PetController],
  providers: [PetService],
  exports: [PetService],
})
export class PetModule {}
