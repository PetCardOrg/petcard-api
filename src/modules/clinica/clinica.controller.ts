import { Controller, Get, Query } from '@nestjs/common';
import {
  ClinicaResponseDto,
  FindNearbyClinicsQueryDto,
} from '@petcardorg/shared';
import { Auth } from '../auth/decorators/auth.decorator';
import { Role } from '../auth/enums/role.enum';
import { ClinicaService } from './clinica.service';

@Controller('clinicas')
export class ClinicaController {
  constructor(private readonly clinicaService: ClinicaService) {}

  @Get()
  @Auth(Role.TUTOR, Role.VET)
  async findNearby(
    @Query() query: FindNearbyClinicsQueryDto,
  ): Promise<ClinicaResponseDto[]> {
    return this.clinicaService.findNearby(query);
  }
}
