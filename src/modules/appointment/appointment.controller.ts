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
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { AppointmentResponse, AppointmentService } from './appointment.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

@ApiTags('appointments')
@Controller('appointments')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Post()
  @Auth(Role.TUTOR)
  @ApiOperation({
    summary: 'Agendar compromisso do pet (sincroniza com Google Calendar)',
  })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAppointmentDto,
  ): Promise<AppointmentResponse> {
    return this.appointmentService.create(user.sub, dto);
  }

  @Get()
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
  ): Promise<AppointmentResponse[]> {
    if (upcoming === 'true') {
      return this.appointmentService.findUpcoming(user.sub);
    }
    return this.appointmentService.findAllForTutor(user.sub);
  }

  @Get(':id')
  @Auth(Role.TUTOR)
  @ApiOperation({ summary: 'Buscar compromisso por id' })
  @ApiNotFoundResponse({ description: 'Compromisso não encontrado' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<AppointmentResponse> {
    return this.appointmentService.findOne(id, user.sub);
  }

  @Patch(':id')
  @Auth(Role.TUTOR)
  @ApiOperation({ summary: 'Atualizar compromisso' })
  @ApiNotFoundResponse({ description: 'Compromisso não encontrado' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateAppointmentDto,
  ): Promise<AppointmentResponse> {
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
