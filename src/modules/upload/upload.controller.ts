import {
  BadRequestException,
  Controller,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { LIMITE_DE_UPLOAD } from '../../config/throttler.config';
import { Auth } from '../auth/decorators/auth.decorator';
import { Role } from '../auth/enums/role.enum';
import { MAX_FILE_SIZE_BYTES, UploadService } from './upload.service';
import { UserThrottlerGuard } from './user-throttler.guard';

const ALLOWED_FOLDERS = ['pets', 'tutors', 'vets'] as const;
type AllowedFolder = (typeof ALLOWED_FOLDERS)[number];

@ApiTags('upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('image')
  @Auth(Role.TUTOR, Role.VET)
  // Mesmo balde `auth` do resto da API (contado por rota) com teto próprio.
  // Os outros throttlers nomeados são dispensados: o guard avalia todos.
  @UseGuards(UserThrottlerGuard)
  @Throttle({ auth: { limit: LIMITE_DE_UPLOAD } })
  @SkipThrottle({ 'public-card': true, places: true, 'clinica-photo': true })
  @ApiTooManyRequestsResponse({ description: 'Limite de uploads excedido' })
  // O teto vai no multer, não só na validação: sem ele o arquivo inteiro era
  // lido para a memória antes de alguém conferir o tamanho, e um POST de
  // gigabytes derrubava o processo antes de chegar na checagem.
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }),
  )
  @ApiOperation({ summary: 'Upload de imagem para o S3 (máx. 5MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiQuery({
    name: 'folder',
    required: false,
    enum: ALLOWED_FOLDERS,
    description: 'Pasta de destino no bucket (padrão: pets)',
  })
  @ApiBadRequestResponse({
    description:
      'Arquivo ausente, tipo inválido, acima de 5MB ou pasta inválida',
  })
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder: AllowedFolder = 'pets',
  ): Promise<{ url: string }> {
    if (!ALLOWED_FOLDERS.includes(folder)) {
      throw new BadRequestException(
        `Invalid folder. Allowed: ${ALLOWED_FOLDERS.join(', ')}`,
      );
    }
    const url = await this.uploadService.uploadFile(file, folder);
    return { url };
  }
}
