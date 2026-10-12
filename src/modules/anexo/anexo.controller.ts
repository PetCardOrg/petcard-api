import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AnexoArquivoResponseDto,
  AnexoResponseDto,
  CreateAnexoDto,
} from '@petcardorg/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { AuthCrmvVerificado } from '../veterinario/crmv/auth-crmv.decorator';
import { ANEXO_MAX_BYTES } from './anexo-arquivo';
import { AnexoService } from './anexo.service';

@ApiTags('anexos')
@Controller()
export class AnexoController {
  constructor(private readonly anexoService: AnexoService) {}

  @Post('pets/:petId/anexos')
  @AuthCrmvVerificado(Role.TUTOR, Role.VET)
  // O teto vai no multer, não só na validação: sem ele o arquivo inteiro era
  // lido para a memória antes de alguém conferir o tamanho.
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: ANEXO_MAX_BYTES } }),
  )
  @ApiOperation({
    summary:
      'Anexar comprovante (JPEG, PNG, WebP ou PDF, até 10 MB) a uma vacina, vermífugo ou medicação',
    description:
      'Enviado por veterinário, o comprovante já nasce verificado; enviado pelo tutor, aguarda a conferência de um veterinário.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'entidade', 'entidade_id'],
      properties: {
        file: { type: 'string', format: 'binary' },
        entidade: {
          type: 'string',
          enum: ['VACINA', 'VERMIFUGO', 'MEDICACAO'],
        },
        entidade_id: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiCreatedResponse({ type: AnexoResponseDto })
  @ApiBadRequestResponse({
    description:
      'Arquivo ausente, de tipo não aceito, grande demais ou acima do limite por registro',
  })
  @ApiNotFoundResponse({ description: 'Pet ou registro não encontrado' })
  async criar(
    @Param('petId') petId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAnexoDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<AnexoResponseDto> {
    return this.anexoService.criar(
      petId,
      { id: user.sub, isVet: user.role === Role.VET },
      dto,
      file,
    );
  }

  @Get('anexos/:id/arquivo')
  @AuthCrmvVerificado(Role.TUTOR, Role.VET)
  @ApiOperation({
    summary: 'Link temporário (5 min) para abrir o arquivo do comprovante',
  })
  @ApiOkResponse({ type: AnexoArquivoResponseDto })
  @ApiNotFoundResponse({ description: 'Anexo não encontrado' })
  async arquivo(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<AnexoArquivoResponseDto> {
    return this.anexoService.linkDoArquivo(id, {
      id: user.sub,
      isVet: user.role === Role.VET,
    });
  }

  @Post('anexos/:id/verificacao')
  @AuthCrmvVerificado(Role.VET)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Veterinário atesta que conferiu o comprovante',
  })
  @ApiOkResponse({ type: AnexoResponseDto })
  @ApiNotFoundResponse({ description: 'Anexo não encontrado' })
  async verificar(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<AnexoResponseDto> {
    return this.anexoService.verificar(id, user.sub);
  }

  @Delete('anexos/:id')
  @AuthCrmvVerificado(Role.TUTOR, Role.VET)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remover comprovante da visualização (o arquivo é preservado)',
  })
  @ApiNotFoundResponse({ description: 'Anexo não encontrado' })
  async remover(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.anexoService.remover(id, {
      id: user.sub,
      isVet: user.role === Role.VET,
    });
  }
}
