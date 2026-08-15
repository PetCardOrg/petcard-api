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
  Query,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CreateVeterinarioDto, UpdateVeterinarioDto } from '@petcardorg/shared';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import {
  CrmvVerificationService,
  type CrmvVerificationStatus,
} from './crmv/crmv-verification.service';
import {
  DashboardPetItem,
  PaginatedResponse,
  VeterinarioResponse,
  VeterinarioService,
} from './veterinario.service';

@ApiTags('veterinarios')
@Controller('veterinarios')
export class VeterinarioController {
  constructor(
    private readonly veterinarioService: VeterinarioService,
    private readonly crmvVerification: CrmvVerificationService,
  ) {}

  @Post()
  @Auth(Role.VET)
  @ApiOperation({ summary: 'Cadastrar veterinário' })
  async create(
    @Body() dto: CreateVeterinarioDto,
  ): Promise<VeterinarioResponse> {
    return this.veterinarioService.create(dto);
  }

  // Declaradas antes de @Get(':id'), senão "me" seria capturado como id.
  @Get('me/crmv')
  @Auth(Role.VET)
  @ApiOperation({ summary: 'Situação da verificação do meu CRMV' })
  async crmvStatus(
    @CurrentUser() user: JwtPayload,
  ): Promise<CrmvVerificationStatus> {
    return this.crmvVerification.getStatus(user.sub);
  }

  @Post('me/crmv/verificar')
  @Auth(Role.VET)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verificar meu CRMV na base externa',
    description:
      'A consulta é paga por chamada: uma verificação dentro do prazo é ' +
      'reaproveitada. Use force=true para consultar de novo mesmo assim.',
  })
  @ApiQuery({ name: 'force', required: false, type: Boolean })
  async verificarCrmv(
    @CurrentUser() user: JwtPayload,
    @Query('force') force?: string,
  ): Promise<CrmvVerificationStatus> {
    return this.crmvVerification.verify(user.sub, force === 'true');
  }

  @Get('dashboard/pets')
  @Auth(Role.VET)
  @ApiOperation({
    summary: 'Dashboard do vet: pets atendidos (paginado, com busca)',
  })
  async dashboardPets(
    @CurrentUser() user: JwtPayload,
    @Query() query: DashboardQueryDto,
  ): Promise<PaginatedResponse<DashboardPetItem>> {
    return this.veterinarioService.findAttendedPets(user.sub, query);
  }

  @Get()
  @Auth(Role.VET)
  @ApiOperation({ summary: 'Listar veterinários' })
  async findAll(): Promise<VeterinarioResponse[]> {
    return this.veterinarioService.findAll();
  }

  @Get(':id')
  @Auth(Role.VET)
  @ApiOperation({ summary: 'Buscar veterinário por id' })
  @ApiNotFoundResponse({ description: 'Veterinário não encontrado' })
  async findOne(@Param('id') id: string): Promise<VeterinarioResponse> {
    return this.veterinarioService.findById(id);
  }

  @Patch(':id')
  @Auth(Role.VET)
  @ApiOperation({ summary: 'Atualizar veterinário' })
  @ApiNotFoundResponse({ description: 'Veterinário não encontrado' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateVeterinarioDto,
  ): Promise<VeterinarioResponse> {
    return this.veterinarioService.update(id, dto);
  }

  @Delete(':id')
  @Auth(Role.VET)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover veterinário' })
  @ApiNotFoundResponse({ description: 'Veterinário não encontrado' })
  async remove(@Param('id') id: string): Promise<void> {
    return this.veterinarioService.remove(id);
  }
}
