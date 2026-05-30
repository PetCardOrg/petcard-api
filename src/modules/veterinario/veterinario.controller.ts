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
import { Auth } from '../auth/decorators/auth.decorator';
import { Role } from '../auth/enums/role.enum';
import { CreateVeterinarioDto } from './dto/create-veterinario.dto';
import { UpdateVeterinarioDto } from './dto/update-veterinario.dto';
import { VeterinarioResponse, VeterinarioService } from './veterinario.service';

@Controller('veterinarios')
export class VeterinarioController {
  constructor(private readonly veterinarioService: VeterinarioService) {}

  @Post()
  @Auth(Role.VET)
  async create(
    @Body() dto: CreateVeterinarioDto,
  ): Promise<VeterinarioResponse> {
    return this.veterinarioService.create(dto);
  }

  @Get()
  @Auth(Role.VET)
  async findAll(): Promise<VeterinarioResponse[]> {
    return this.veterinarioService.findAll();
  }

  @Get(':id')
  @Auth(Role.VET)
  async findOne(@Param('id') id: string): Promise<VeterinarioResponse> {
    return this.veterinarioService.findById(id);
  }

  @Patch(':id')
  @Auth(Role.VET)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateVeterinarioDto,
  ): Promise<VeterinarioResponse> {
    return this.veterinarioService.update(id, dto);
  }

  @Delete(':id')
  @Auth(Role.VET)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    return this.veterinarioService.remove(id);
  }
}
