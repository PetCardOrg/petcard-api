import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
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
