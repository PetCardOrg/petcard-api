import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CrmvVerificationService } from '../crmv/crmv-verification.service';
import { CrmvVerifiedGuard } from '../crmv/crmv-verified.guard';

const contextComUsuario = (user: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('CrmvVerifiedGuard', () => {
  let verification: { getStatus: jest.Mock };
  let guard: CrmvVerifiedGuard;

  beforeEach(() => {
    verification = { getStatus: jest.fn() };
    guard = new CrmvVerifiedGuard(
      verification as unknown as CrmvVerificationService,
    );
  });

  it('libera veterinário com CRMV verificado', async () => {
    verification.getStatus.mockResolvedValue({ verified: true });

    await expect(
      guard.canActivate(contextComUsuario({ sub: 'vet-1' })),
    ).resolves.toBe(true);
    expect(verification.getStatus).toHaveBeenCalledWith('vet-1');
  });

  it('bloqueia quando o CRMV não está verificado', async () => {
    verification.getStatus.mockResolvedValue({ verified: false });

    await expect(
      guard.canActivate(contextComUsuario({ sub: 'vet-1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bloqueia quando o sub do token não é um veterinário', async () => {
    // Token de tutor com role VET: os dois logins leem tabelas diferentes.
    verification.getStatus.mockRejectedValue(
      new Error('Veterinário não encontrado'),
    );

    await expect(
      guard.canActivate(contextComUsuario({ sub: 'tutor-1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bloqueia quando não há usuário autenticado', async () => {
    await expect(
      guard.canActivate(contextComUsuario(undefined)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(verification.getStatus).not.toHaveBeenCalled();
  });
});
