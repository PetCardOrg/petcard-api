import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
} from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UpdateTutorDto } from '@petcardorg/shared';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { TutorService, type TutorPublico } from './tutor.service';

@ApiTags('tutors')
@Controller('tutors')
export class TutorController {
  constructor(private readonly tutorService: TutorService) {}

  @Get('me')
  @Auth(Role.TUTOR)
  @ApiOperation({ summary: 'Dados do tutor autenticado' })
  async getMe(@CurrentUser() user: JwtPayload): Promise<TutorPublico> {
    return this.tutorService.findById(user.sub);
  }

  @Patch('me')
  @Auth(Role.TUTOR)
  @ApiOperation({ summary: 'Atualizar dados do tutor autenticado' })
  async updateMe(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateTutorDto,
  ): Promise<TutorPublico> {
    return this.tutorService.updateById(user.sub, dto);
  }

  @Delete('me')
  @Auth(Role.TUTOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Excluir definitivamente a conta do tutor autenticado',
    description:
      'Apaga a conta e tudo que depende dela: pets, prontuário, carteira ' +
      'digital, agendamentos e notificações. Não há desfazer.',
  })
  async removeMe(@CurrentUser() user: JwtPayload): Promise<void> {
    return this.tutorService.removeById(user.sub);
  }

  // Declarada depois de 'me', senão a rota por id capturaria a palavra.
  @Get(':id')
  @Auth(Role.VET)
  @ApiOperation({
    summary: 'Buscar tutor por id (vet que atende algum pet dele)',
  })
  @ApiForbiddenResponse({ description: 'Tutor fora da lista de atendidos' })
  @ApiNotFoundResponse({ description: 'Tutor não encontrado' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<TutorPublico> {
    return this.tutorService.findByIdForVet(id, user.sub);
  }
}
