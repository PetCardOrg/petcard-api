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
  CreateVaccineRecordDto,
  UpdateVaccineRecordDto,
  VaccineRecordResponseDto,
} from '@petcardorg/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuthCrmvVerificado } from '../../veterinario/crmv/auth-crmv.decorator';
import { Role } from '../../auth/enums/role.enum';
import type { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { VaccineService } from './vaccine.service';

@ApiTags('vaccines')
@Controller()
export class VaccineController {
  constructor(private readonly vaccineService: VaccineService) {}

  @Post('pets/:petId/vaccines')
  @AuthCrmvVerificado(Role.TUTOR, Role.VET)
  @ApiOperation({ summary: 'Registrar vacina no prontuário do pet' })
  @ApiCreatedResponse({ type: VaccineRecordResponseDto })
  @ApiNotFoundResponse({ description: 'Pet não encontrado' })
  async create(
    @Param('petId') petId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateVaccineRecordDto,
  ): Promise<VaccineRecordResponseDto> {
    const isVet = user.role === Role.VET;
    return this.vaccineService.create(petId, user.sub, isVet, dto);
  }

  @Get('pets/:petId/vaccines')
  @AuthCrmvVerificado(Role.TUTOR, Role.VET)
  @ApiOperation({ summary: 'Listar vacinas do pet' })
  @ApiOkResponse({ type: VaccineRecordResponseDto, isArray: true })
  @ApiNotFoundResponse({ description: 'Pet não encontrado' })
  async findAll(
    @Param('petId') petId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<VaccineRecordResponseDto[]> {
    const isVet = user.role === Role.VET;
    return this.vaccineService.findAllForPet(petId, user.sub, isVet);
  }

  @Patch('vaccines/:id')
  @AuthCrmvVerificado(Role.TUTOR, Role.VET)
  @ApiOperation({ summary: 'Atualizar registro de vacina' })
  @ApiOkResponse({ type: VaccineRecordResponseDto })
  @ApiNotFoundResponse({ description: 'Registro não encontrado' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateVaccineRecordDto,
  ): Promise<VaccineRecordResponseDto> {
    const isVet = user.role === Role.VET;
    return this.vaccineService.update(id, user.sub, isVet, dto);
  }

  @Delete('vaccines/:id')
  @AuthCrmvVerificado(Role.TUTOR, Role.VET)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover registro de vacina' })
  @ApiNotFoundResponse({ description: 'Registro não encontrado' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    const isVet = user.role === Role.VET;
    return this.vaccineService.remove(id, user.sub, isVet);
  }
}
