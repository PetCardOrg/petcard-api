import {
  BadRequestException,
  Controller,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Auth } from '../auth/decorators/auth.decorator';
import { Role } from '../auth/enums/role.enum';
import { UploadService } from './upload.service';

const ALLOWED_FOLDERS = ['pets', 'tutors'] as const;
type AllowedFolder = (typeof ALLOWED_FOLDERS)[number];

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('image')
  @Auth(Role.TUTOR, Role.VET)
  @UseInterceptors(FileInterceptor('file'))
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
