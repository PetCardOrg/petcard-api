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
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  AppointmentResponseDto,
  CreateAppointmentDto,
  Role,
  UpdateAppointmentDto,
} from '@petcardorg/shared';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { AppointmentService } from './appointment.service';

@ApiTags('appointments')
@Controller('appointments')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Post()
  @ApiCreatedResponse({ type: AppointmentResponseDto })
  @Auth(Role.TUTOR)
  @ApiOperation({
    summary: 'Agendar compromisso do pet (sincroniza com Google Calendar)',
  })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    return this.appointmentService.create(user.sub, dto);
  }

  @Get()
  @ApiOkResponse({ type: AppointmentResponseDto, isArray: true })
  @Auth(Role.TUTOR)
  @ApiOperation({ summary: 'Listar compromissos do tutor autenticado' })
  @ApiQuery({
    name: 'upcoming',
    required: false,
    description: "Se 'true', retorna apenas compromissos futuros",
  })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('upcoming') upcoming?: string,
  ): Promise<AppointmentResponseDto[]> {
    if (upcoming === 'true') {
      return this.appointmentService.findUpcoming(user.sub);
    }
    return this.appointmentService.findAllForTutor(user.sub);
  }

  @Get(':id')
  @ApiOkResponse({ type: AppointmentResponseDto })
  @Auth(Role.TUTOR)
  @ApiOperation({ summary: 'Buscar compromisso por id' })
  @ApiNotFoundResponse({ description: 'Compromisso não encontrado' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<AppointmentResponseDto> {
    return this.appointmentService.findOne(id, user.sub);
  }

  @Patch(':id')
  @ApiOkResponse({ type: AppointmentResponseDto })
  @Auth(Role.TUTOR)
  @ApiOperation({ summary: 'Atualizar compromisso' })
  @ApiNotFoundResponse({ description: 'Compromisso não encontrado' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    return this.appointmentService.update(id, user.sub, dto);
  }

  @Delete(':id')
  @Auth(Role.TUTOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancelar compromisso' })
  @ApiNotFoundResponse({ description: 'Compromisso não encontrado' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.appointmentService.remove(id, user.sub);
  }
}
