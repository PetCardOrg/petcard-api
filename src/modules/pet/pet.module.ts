import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CardModule } from '../card/card.module';
import { TutorModule } from '../tutor/tutor.module';
import { UploadModule } from '../upload/upload.module';
import { PetController } from './pet.controller';
import { PetService } from './pet.service';

@Module({
  imports: [AuthModule, TutorModule, CardModule, UploadModule],
  controllers: [PetController],
  providers: [PetService],
  exports: [PetService],
})
export class PetModule {}
