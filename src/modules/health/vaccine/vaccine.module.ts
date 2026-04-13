import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PetModule } from '../../pet/pet.module';
import { VaccineController } from './vaccine.controller';
import { VaccineService } from './vaccine.service';

@Module({
  imports: [AuthModule, PetModule],
  controllers: [VaccineController],
  providers: [VaccineService],
})
export class VaccineModule {}
