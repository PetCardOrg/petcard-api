import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { Tutor } from '@prisma/client';
import { UpdateTutorDto } from '@petcardorg/shared';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { TutorService } from './tutor.service';

@Controller('tutors')
export class TutorController {
  constructor(private readonly tutorService: TutorService) {}

  @Get('me')
  @Auth(Role.TUTOR)
  async getMe(@CurrentUser() user: JwtPayload): Promise<Tutor> {
    return this.tutorService.findByAuth0Id(user.sub);
  }

  @Patch('me')
  @Auth(Role.TUTOR)
  async updateMe(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateTutorDto,
  ): Promise<Tutor> {
    return this.tutorService.updateByAuth0Id(user.sub, dto);
  }

  @Get(':id')
  @Auth(Role.VET)
  async findOne(@Param('id') id: string): Promise<Tutor> {
    return this.tutorService.findById(id);
  }
}
