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
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateMedicationRecordDto,
  MedicationRecordResponseDto,
  UpdateMedicationRecordDto,
} from '@petcardorg/shared';
import { Auth } from '../../auth/decorators/auth.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Role } from '../../auth/enums/role.enum';
import type { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { MedicationService } from './medication.service';

@ApiTags('medications')
@Controller()
export class MedicationController {
  constructor(private readonly medicationService: MedicationService) {}

  @Post('pets/:petId/medications')
  @Auth(Role.TUTOR, Role.VET)
  @ApiOperation({ summary: 'Registrar medicação no prontuário do pet' })
  @ApiCreatedResponse({ type: MedicationRecordResponseDto })
  @ApiNotFoundResponse({ description: 'Pet não encontrado' })
  async create(
    @Param('petId') petId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateMedicationRecordDto,
  ): Promise<MedicationRecordResponseDto> {
    const isVet = user.role === Role.VET;
    return this.medicationService.create(petId, user.sub, isVet, dto);
  }

  @Get('pets/:petId/medications')
  @Auth(Role.TUTOR, Role.VET)
  @ApiOperation({ summary: 'Listar medicações do pet' })
  @ApiOkResponse({ type: MedicationRecordResponseDto, isArray: true })
  @ApiNotFoundResponse({ description: 'Pet não encontrado' })
  async findAll(
    @Param('petId') petId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<MedicationRecordResponseDto[]> {
    const isVet = user.role === Role.VET;
    return this.medicationService.findAllForPet(petId, user.sub, isVet);
  }

  @Patch('medications/:id')
  @Auth(Role.TUTOR, Role.VET)
  @ApiOperation({ summary: 'Atualizar registro de medicação' })
  @ApiOkResponse({ type: MedicationRecordResponseDto })
  @ApiNotFoundResponse({ description: 'Registro não encontrado' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateMedicationRecordDto,
  ): Promise<MedicationRecordResponseDto> {
    const isVet = user.role === Role.VET;
    return this.medicationService.update(id, user.sub, isVet, dto);
  }

  @Delete('medications/:id')
  @Auth(Role.TUTOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover registro de medicação' })
  @ApiNotFoundResponse({ description: 'Registro não encontrado' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.medicationService.remove(id, user.sub);
  }
}
