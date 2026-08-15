import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { CRMV_VALIDATOR, type CrmvValidator } from './crmv/crmv-validator';
import { CrmvVerificationService } from './crmv/crmv-verification.service';
import { CrmvVerifiedGuard } from './crmv/crmv-verified.guard';
import { InfosimplesCrmvValidator } from './crmv/infosimples-crmv.validator';
import { StubCrmvValidator } from './crmv/stub-crmv.validator';
import { VeterinarioController } from './veterinario.controller';
import { VeterinarioService } from './veterinario.service';

/**
 * O provedor de validação de CRMV é escolhido por configuração: `infosimples`
 * consulta a base real (paga, por chamada) e qualquer outro valor cai no stub,
 * para o CI e a demo não dependerem de rede nem de crédito.
 */
const crmvValidatorProvider = {
  provide: CRMV_VALIDATOR,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): CrmvValidator =>
    configService.get<string>('crmv.provider') === 'infosimples'
      ? new InfosimplesCrmvValidator(configService)
      : new StubCrmvValidator(),
};

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [VeterinarioController],
  providers: [
    VeterinarioService,
    crmvValidatorProvider,
    CrmvVerificationService,
    CrmvVerifiedGuard,
  ],
  exports: [VeterinarioService, CrmvVerificationService, CrmvVerifiedGuard],
})
export class VeterinarioModule {}
