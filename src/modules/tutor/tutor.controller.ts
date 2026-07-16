import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Tutor } from '@prisma/client';
import { UpdateTutorDto } from '@petcardorg/shared';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { TutorService } from './tutor.service';

@ApiTags('tutors')
@Controller('tutors')
export class TutorController {
  constructor(private readonly tutorService: TutorService) {}

  @Get('me')
  @Auth(Role.TUTOR)
  @ApiOperation({ summary: 'Dados do tutor autenticado' })
  async getMe(@CurrentUser() user: JwtPayload): Promise<Tutor> {
    return this.tutorService.findById(user.sub);
  }

  @Patch('me')
  @Auth(Role.TUTOR)
  @ApiOperation({ summary: 'Atualizar dados do tutor autenticado' })
  async updateMe(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateTutorDto,
  ): Promise<Tutor> {
    return this.tutorService.updateById(user.sub, dto);
  }

  @Get(':id')
  @Auth(Role.VET)
  @ApiOperation({ summary: 'Buscar tutor por id (visão do vet)' })
  @ApiNotFoundResponse({ description: 'Tutor não encontrado' })
  async findOne(@Param('id') id: string): Promise<Tutor> {
    return this.tutorService.findById(id);
  }
}
