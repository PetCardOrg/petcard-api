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
  CreateDewormingRecordDto,
  DewormingRecordResponseDto,
  UpdateDewormingRecordDto,
} from '@petcardorg/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuthCrmvVerificado } from '../../veterinario/crmv/auth-crmv.decorator';
import { Role } from '../../auth/enums/role.enum';
import type { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { DewormingService } from './deworming.service';

@ApiTags('dewormings')
@Controller()
export class DewormingController {
  constructor(private readonly dewormingService: DewormingService) {}

  @Post('pets/:petId/dewormings')
  @AuthCrmvVerificado(Role.TUTOR, Role.VET)
  @ApiOperation({ summary: 'Registrar vermífugo no prontuário do pet' })
  @ApiCreatedResponse({ type: DewormingRecordResponseDto })
  @ApiNotFoundResponse({ description: 'Pet não encontrado' })
  async create(
    @Param('petId') petId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateDewormingRecordDto,
  ): Promise<DewormingRecordResponseDto> {
    const isVet = user.role === Role.VET;
    return this.dewormingService.create(petId, user.sub, isVet, dto);
  }

  @Get('pets/:petId/dewormings')
  @AuthCrmvVerificado(Role.TUTOR, Role.VET)
  @ApiOperation({ summary: 'Listar vermífugos do pet' })
  @ApiOkResponse({ type: DewormingRecordResponseDto, isArray: true })
  @ApiNotFoundResponse({ description: 'Pet não encontrado' })
  async findAll(
    @Param('petId') petId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<DewormingRecordResponseDto[]> {
    const isVet = user.role === Role.VET;
    return this.dewormingService.findAllForPet(petId, user.sub, isVet);
  }

  @Patch('dewormings/:id')
  @AuthCrmvVerificado(Role.TUTOR, Role.VET)
  @ApiOperation({ summary: 'Atualizar registro de vermífugo' })
  @ApiOkResponse({ type: DewormingRecordResponseDto })
  @ApiNotFoundResponse({ description: 'Registro não encontrado' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateDewormingRecordDto,
  ): Promise<DewormingRecordResponseDto> {
    const isVet = user.role === Role.VET;
    return this.dewormingService.update(id, user.sub, isVet, dto);
  }

  @Delete('dewormings/:id')
  @AuthCrmvVerificado(Role.TUTOR, Role.VET)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover registro de vermífugo' })
  @ApiNotFoundResponse({ description: 'Registro não encontrado' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    const isVet = user.role === Role.VET;
    return this.dewormingService.remove(id, user.sub, isVet);
  }
}
