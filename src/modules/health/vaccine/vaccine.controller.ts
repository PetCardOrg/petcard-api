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
import {
  CreateVaccineRecordDto,
  UpdateVaccineRecordDto,
  VaccineRecordResponseDto,
} from '@petcardorg/shared';
import { Auth } from '../../auth/decorators/auth.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Role } from '../../auth/enums/role.enum';
import type { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { VaccineService } from './vaccine.service';

@Controller()
export class VaccineController {
  constructor(private readonly vaccineService: VaccineService) {}

  @Post('pets/:petId/vaccines')
  @Auth(Role.TUTOR, Role.VET)
  async create(
    @Param('petId') petId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateVaccineRecordDto,
  ): Promise<VaccineRecordResponseDto> {
    const isVet = user.role === Role.VET;
    return this.vaccineService.create(petId, user.sub, isVet, dto);
  }

  @Get('pets/:petId/vaccines')
  @Auth(Role.TUTOR, Role.VET)
  async findAll(
    @Param('petId') petId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<VaccineRecordResponseDto[]> {
    const isVet = user.role === Role.VET;
    return this.vaccineService.findAllForPet(petId, user.sub, isVet);
  }

  @Patch('vaccines/:id')
  @Auth(Role.TUTOR, Role.VET)
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateVaccineRecordDto,
  ): Promise<VaccineRecordResponseDto> {
    const isVet = user.role === Role.VET;
    return this.vaccineService.update(id, user.sub, isVet, dto);
  }

  @Delete('vaccines/:id')
  @Auth(Role.TUTOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.vaccineService.remove(id, user.sub);
  }
}
