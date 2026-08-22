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
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { AuthCrmvVerificado } from './crmv/auth-crmv.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import {
  AdicionarPetAtendidoDto,
  PetAtendidoResponseDto,
  UpdateVeterinarioDto,
} from '@petcardorg/shared';
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

  @Patch('me')
  @Auth(Role.VET)
  @ApiOperation({
    summary: 'Atualizar meu cadastro',
    description:
      'Só o próprio veterinário altera o próprio cadastro — o id vem do ' +
      'token, não da rota. Trocar o CRMV zera a verificação: o registro novo ' +
      'precisa ser verificado antes de liberar dado clínico de novo.',
  })
  async updateMe(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateVeterinarioDto,
  ): Promise<VeterinarioResponse> {
    return this.veterinarioService.update(user.sub, dto);
  }

  @Delete('me')
  @Auth(Role.VET)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir minha conta de veterinário' })
  async removeMe(@CurrentUser() user: JwtPayload): Promise<void> {
    return this.veterinarioService.remove(user.sub);
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

  @Post('me/pets')
  @AuthCrmvVerificado(Role.VET)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Adicionar à minha lista o pet cuja carteira foi lida no QR',
    description:
      'Ter o token do QR é a autorização de fato para o atendimento. Reabrir ' +
      'a carteira de um pet que já está na lista só atualiza o último ' +
      'atendimento. Exige CRMV verificado, como o acesso à carteira clínica.',
  })
  @ApiOkResponse({ type: PetAtendidoResponseDto })
  @ApiNotFoundResponse({ description: 'Carteira não encontrada' })
  async adicionarPet(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AdicionarPetAtendidoDto,
  ): Promise<PetAtendidoResponseDto> {
    return this.veterinarioService.adicionarPetPorToken(user.sub, dto.token);
  }

  @Delete('me/pets/:petId')
  @Auth(Role.VET)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Tirar o pet da minha lista',
    description:
      'Remove só o vínculo. O pet, os registros clínicos e a trilha de ações ' +
      'permanecem — inclusive para outros veterinários.',
  })
  @ApiNotFoundResponse({ description: 'Pet não está na lista' })
  async removerPet(
    @CurrentUser() user: JwtPayload,
    @Param('petId') petId: string,
  ): Promise<void> {
    return this.veterinarioService.removerPetAtendido(user.sub, petId);
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
}
