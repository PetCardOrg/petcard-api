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
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
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
import { LIMITE_DE_ROTA_CARA } from '../../config/throttler.config';
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

/**
 * Como em `auth.controller.ts`, o `ThrottlerGuard` avalia TODOS os throttlers
 * nomeados da configuração — por isso quem usa `@Throttle({ auth: ... })`
 * também dispensa o da carteira pública, senão seria o limite dela a valer.
 */
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
  // `force=true` pula o cache de 180 dias, e cada chamada que passa por aqui é
  // uma consulta cobrada na base externa. Sem limite, um laço nesta rota vira
  // conta a pagar. Teto mais baixo que o das rotas de auth: verificar CRMV é
  // ação rara, ninguém precisa fazê-la dez vezes por minuto.
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { limit: LIMITE_DE_ROTA_CARA } })
  @SkipThrottle({ 'public-card': true })
  @ApiTooManyRequestsResponse({ description: 'Limite de tentativas excedido' })
  @ApiOperation({
    summary: 'Verificar meu CRMV na base externa',
    description:
      'A consulta é paga por chamada: uma verificação dentro do prazo é ' +
      'reaproveitada. Use force=true para consultar de novo mesmo assim. ' +
      'Rota com limite próprio, mais apertado que o das rotas de login.',
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
      'precisa ser verificado antes de liberar dado clínico de novo. ' +
      'Trocar a senha exige `senha_atual` e encerra as sessões abertas, ' +
      'inclusive a que fez a troca — é preciso entrar de novo.',
  })
  @ApiUnauthorizedResponse({ description: 'Senha atual incorreta' })
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

  // Não há rota para ler o cadastro de outro veterinário. A listagem geral
  // entregava e-mail, telefone e CRMV de todo mundo a qualquer vet logado —
  // dado pessoal que nenhuma tela usa. O próprio cadastro vem do login, em
  // `GET /auth/veterinario/profile`.
}
