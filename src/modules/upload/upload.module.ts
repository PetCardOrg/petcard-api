import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

/**
 * `forwardRef` no import de AuthModule: VeterinarioModule e TutorModule agora
 * importam este módulo para validar URL de foto contra o bucket, e os dois já
 * entram no ciclo AuthModule -> VeterinarioModule. Sem o forwardRef aqui, o
 * require circular resolvia AuthModule como `undefined` no meio da cadeia
 * (AuthModule -> VeterinarioModule -> UploadModule -> AuthModule).
 */
@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
