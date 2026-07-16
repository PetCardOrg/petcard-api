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
import { ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CreateVeterinarioDto, UpdateVeterinarioDto } from '@petcardorg/shared';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import {
  DashboardPetItem,
  PaginatedResponse,
  VeterinarioResponse,
  VeterinarioService,
} from './veterinario.service';

@ApiTags('veterinarios')
@Controller('veterinarios')
export class VeterinarioController {
  constructor(private readonly veterinarioService: VeterinarioService) {}

  @Post()
  @Auth(Role.VET)
  @ApiOperation({ summary: 'Cadastrar veterinário' })
  async create(
    @Body() dto: CreateVeterinarioDto,
  ): Promise<VeterinarioResponse> {
    return this.veterinarioService.create(dto);
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
