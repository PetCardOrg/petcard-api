import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { MedicationRecord } from '@prisma/client';
import {
  CreateMedicationRecordDto,
  UpdateMedicationRecordDto,
} from '@petcardorg/shared';
import { Auth } from '../../auth/decorators/auth.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Role } from '../../auth/enums/role.enum';
import type { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { MedicationService } from './medication.service';

@Controller()
export class MedicationController {
  constructor(private readonly medicationService: MedicationService) {}

  @Post('pets/:petId/medications')
  @Auth(Role.TUTOR, Role.VET)
  async create(
    @Param('petId') petId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateMedicationRecordDto,
  ): Promise<MedicationRecord> {
    const isVet = user.permissions?.includes(Role.VET) ?? false;
    return this.medicationService.create(petId, user.sub, isVet, dto);
  }

  @Get('pets/:petId/medications')
  @Auth(Role.TUTOR, Role.VET)
  async findAll(
    @Param('petId') petId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<MedicationRecord[]> {
    const isVet = user.permissions?.includes(Role.VET) ?? false;
    return this.medicationService.findAllForPet(petId, user.sub, isVet);
  }

  @Patch('medications/:id')
  @Auth(Role.TUTOR, Role.VET)
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateMedicationRecordDto,
  ): Promise<MedicationRecord> {
    const isVet = user.permissions?.includes(Role.VET) ?? false;
    return this.medicationService.update(id, user.sub, isVet, dto);
  }

  @Delete('medications/:id')
  @Auth(Role.TUTOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.medicationService.remove(id, user.sub);
  }
}
