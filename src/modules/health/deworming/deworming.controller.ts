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
  CreateDewormingRecordDto,
  DewormingRecordResponseDto,
  UpdateDewormingRecordDto,
} from '@petcardorg/shared';
import { Auth } from '../../auth/decorators/auth.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Role } from '../../auth/enums/role.enum';
import type { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { DewormingService } from './deworming.service';

@Controller()
export class DewormingController {
  constructor(private readonly dewormingService: DewormingService) {}

  @Post('pets/:petId/dewormings')
  @Auth(Role.TUTOR, Role.VET)
  async create(
    @Param('petId') petId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateDewormingRecordDto,
  ): Promise<DewormingRecordResponseDto> {
    const isVet = user.permissions?.includes(Role.VET) ?? false;
    return this.dewormingService.create(petId, user.sub, isVet, dto);
  }

  @Get('pets/:petId/dewormings')
  @Auth(Role.TUTOR, Role.VET)
  async findAll(
    @Param('petId') petId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<DewormingRecordResponseDto[]> {
    const isVet = user.permissions?.includes(Role.VET) ?? false;
    return this.dewormingService.findAllForPet(petId, user.sub, isVet);
  }

  @Patch('dewormings/:id')
  @Auth(Role.TUTOR, Role.VET)
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateDewormingRecordDto,
  ): Promise<DewormingRecordResponseDto> {
    const isVet = user.permissions?.includes(Role.VET) ?? false;
    return this.dewormingService.update(id, user.sub, isVet, dto);
  }

  @Delete('dewormings/:id')
  @Auth(Role.TUTOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.dewormingService.remove(id, user.sub);
  }
}
