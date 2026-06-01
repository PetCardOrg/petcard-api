import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VeterinarioController } from './veterinario.controller';
import { VeterinarioService } from './veterinario.service';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [VeterinarioController],
  providers: [VeterinarioService],
  exports: [VeterinarioService],
})
export class VeterinarioModule {}
