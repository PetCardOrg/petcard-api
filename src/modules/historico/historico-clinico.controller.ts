import { Controller, Get, Param } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HistoricoClinicoResponseDto } from '@petcardorg/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { AuthCrmvVerificado } from '../veterinario/crmv/auth-crmv.decorator';
import { HistoricoClinicoService } from './historico-clinico.service';

@ApiTags('historico-clinico')
@Controller()
export class HistoricoClinicoController {
  constructor(private readonly historico: HistoricoClinicoService) {}

  @Get('pets/:petId/historico-clinico')
  @AuthCrmvVerificado(Role.TUTOR, Role.VET)
  @ApiOperation({
    summary: 'Histórico clínico completo do pet',
    description:
      'Linha do tempo com notas, vacinas, vermífugos e medicações. Inclui ' +
      'registros excluídos, marcados por `excluido`, e a trilha de ações de ' +
      'cada um com o responsável e o CRMV.',
  })
  @ApiNotFoundResponse({ description: 'Pet não encontrado' })
  async doPet(
    @Param('petId') petId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<HistoricoClinicoResponseDto> {
    return this.historico.doPet(petId, user.sub, user.role === Role.VET);
  }
}
