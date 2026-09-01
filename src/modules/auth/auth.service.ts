import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthTokenPurpose, type Tutor } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { CreateVeterinarioDto } from '@petcardorg/shared';
import { BCRYPT_ROUNDS } from '../../common/crypto/password.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { CrmvVerificationService } from '../veterinario/crmv/crmv-verification.service';
import { MailService } from '../mail/mail.service';
import { AuthTokenService } from './auth-token.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { Role } from './enums/role.enum';

/**
 * Hash descartável, com o mesmo custo dos reais, comparado quando o e-mail não
 * existe.
 *
 * Sem ele o login respondia na hora para e-mail inexistente e só depois do
 * bcrypt para e-mail cadastrado — diferença medível, que transforma a rota num
 * oráculo de quais e-mails têm conta no PetCard. Calculado uma vez, na
 * primeira tentativa frustrada, para não custar 12 rounds no boot.
 */
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash('petcard-dummy-password', BCRYPT_ROUNDS);
  return dummyHash;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClient = new OAuth2Client();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly authToken: AuthTokenService,
    private readonly mail: MailService,
    @Inject(forwardRef(() => CrmvVerificationService))
    private readonly crmvVerification: CrmvVerificationService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.tutor.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const tutor = await this.prisma.tutor.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: hashedPassword,
      },
    });

    await this.dispatchEmailVerification(tutor);

    return this.buildTutorSession(tutor);
  }

  async login(dto: LoginDto) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { email: dto.email },
    });

    const passwordValid = await bcrypt.compare(
      dto.password,
      tutor?.password ?? (await getDummyHash()),
    );

    if (!tutor || !tutor.password || !passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildTutorSession(tutor);
  }

  /**
   * Login/cadastro social do tutor (mobile#54).
   *
   * O app manda o ID token do Google; validamos a assinatura e o `aud` contra
   * os client IDs configurados. Casamos por `googleId`, senão pelo e-mail
   * (vinculando a conta existente), senão criamos uma conta já verificada — o
   * Google confirma o endereço por nós.
   */
  async googleLogin(dto: GoogleLoginDto) {
    const clientIds = this.config.get<string[]>('googleAuth.clientIds') ?? [];
    if (clientIds.length === 0) {
      throw new ServiceUnavailableException(
        'Login com Google não está configurado no servidor.',
      );
    }

    let email: string | undefined;
    let googleId: string | undefined;
    let name: string | undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.idToken,
        audience: clientIds,
      });
      const payload = ticket.getPayload();
      email = payload?.email?.toLowerCase();
      googleId = payload?.sub;
      name = payload?.name;
      if (!payload?.email_verified) {
        throw new Error('e-mail não verificado no Google');
      }
    } catch (error) {
      this.logger.warn(
        `ID token do Google rejeitado: ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      );
      throw new UnauthorizedException(
        'Não foi possível validar a conta Google.',
      );
    }

    if (!email || !googleId) {
      throw new UnauthorizedException('Conta Google sem e-mail utilizável.');
    }

    let tutor =
      (await this.prisma.tutor.findUnique({ where: { googleId } })) ??
      (await this.prisma.tutor.findUnique({ where: { email } }));

    if (!tutor) {
      tutor = await this.prisma.tutor.create({
        data: {
          name: name?.trim() || email.split('@')[0],
          email,
          googleId,
          emailVerifiedAt: new Date(),
        },
      });
    } else if (tutor.googleId !== googleId || tutor.emailVerifiedAt === null) {
      tutor = await this.prisma.tutor.update({
        where: { id: tutor.id },
        data: {
          googleId,
          emailVerifiedAt: tutor.emailVerifiedAt ?? new Date(),
        },
      });
    }

    return this.buildTutorSession(tutor);
  }

  /**
   * Início do "esqueci minha senha". Responde igual exista ou não a conta —
   * a rota não pode virar um teste de quais e-mails estão cadastrados.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const email = dto.email.toLowerCase();
    const tutor = await this.prisma.tutor.findUnique({ where: { email } });

    if (!tutor) {
      return;
    }

    const token = await this.authToken.issue(
      tutor.id,
      AuthTokenPurpose.PASSWORD_RESET,
    );

    try {
      await this.mail.sendPasswordReset(tutor.email, token);
    } catch (error) {
      this.logger.error(
        `Falha ao enviar e-mail de redefinição para ${tutor.email}: ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      );
    }
  }

  /** Conclui a redefinição: consome o token e grava a nova senha. */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tutorId = await this.authToken.consume(
      dto.token,
      AuthTokenPurpose.PASSWORD_RESET,
    );

    await this.prisma.tutor.update({
      where: { id: tutorId },
      data: { password: await bcrypt.hash(dto.password, BCRYPT_ROUNDS) },
    });
  }

  /** Marca o e-mail do tutor como verificado a partir do token do link. */
  async verifyEmail(dto: VerifyEmailDto): Promise<void> {
    const tutorId = await this.authToken.consume(
      dto.token,
      AuthTokenPurpose.EMAIL_VERIFICATION,
    );

    await this.prisma.tutor.update({
      where: { id: tutorId },
      data: { emailVerifiedAt: new Date() },
    });
  }

  /** Reenvia o link de verificação. Silencioso se já estiver verificado. */
  async resendVerification(tutorId: string): Promise<void> {
    const tutor = await this.prisma.tutor.findUnique({
      where: { id: tutorId },
    });
    if (!tutor) {
      throw new BadRequestException('Conta não encontrada.');
    }
    if (tutor.emailVerifiedAt) {
      return;
    }
    await this.dispatchEmailVerification(tutor);
  }

  /**
   * Cadastro público de veterinário (api#124).
   *
   * O CRMV é validado na base externa durante o cadastro, para o veterinário
   * já entrar liberado em vez de esbarrar no bloqueio da api#113 no primeiro
   * atendimento.
   */
  async registerVeterinario(dto: CreateVeterinarioDto) {
    const porEmail = await this.prisma.veterinario.findUnique({
      where: { email: dto.email },
    });
    if (porEmail) {
      throw new ConflictException('Email already registered');
    }

    const porCrmv = await this.prisma.veterinario.findUnique({
      where: { crmv: dto.crmv },
    });
    if (porCrmv) {
      throw new ConflictException('CRMV already registered');
    }

    // Formato irreconhecível falha aqui, antes de criar a conta: não vale
    // cadastrar um CRMV que nunca poderá ser verificado.
    this.crmvVerification.parseCrmv(dto.crmv);

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const vet = await this.prisma.veterinario.create({
      data: {
        nome: dto.nome,
        email: dto.email,
        password: hashedPassword,
        crmv: dto.crmv,
        telefone: dto.telefone,
      },
    });

    // A verificação é tentada, mas não pode barrar o cadastro: o provedor é
    // externo e pago, e uma indisponibilidade dele não pode impedir alguém de
    // criar conta. Quem nascer não verificado usa o botão de verificar depois.
    let crmvVerificado = false;
    try {
      const status = await this.crmvVerification.verify(vet.id);
      crmvVerificado = status.verified;
    } catch (error) {
      this.logger.warn(
        `Cadastro de ${dto.email} concluído sem verificar o CRMV ${dto.crmv}: ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      );
    }

    return {
      access_token: this.signToken(vet.id, vet.email, Role.VET),
      user: {
        id: vet.id,
        nome: vet.nome,
        email: vet.email,
        crmv: vet.crmv,
        telefone: vet.telefone,
        role: Role.VET,
      },
      crmv_verificado: crmvVerificado,
    };
  }

  async loginVeterinario(dto: LoginDto) {
    const vet = await this.prisma.veterinario.findUnique({
      where: { email: dto.email },
    });

    const passwordValid = await bcrypt.compare(
      dto.password,
      vet?.password ?? (await getDummyHash()),
    );

    if (!vet || !passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.signToken(vet.id, vet.email, Role.VET);

    return {
      access_token: token,
      user: {
        id: vet.id,
        nome: vet.nome,
        email: vet.email,
        crmv: vet.crmv,
        telefone: vet.telefone,
        foto_url: vet.photoUrl ?? undefined,
        role: Role.VET,
      },
    };
  }

  async getVeterinarioProfile(id: string) {
    const vet = await this.prisma.veterinario.findUnique({
      where: { id },
    });

    if (!vet) {
      throw new UnauthorizedException('Veterinario not found');
    }

    return {
      id: vet.id,
      nome: vet.nome,
      email: vet.email,
      crmv: vet.crmv,
      telefone: vet.telefone,
      foto_url: vet.photoUrl ?? undefined,
      role: Role.VET,
    };
  }

  private async dispatchEmailVerification(tutor: Tutor): Promise<void> {
    // Best-effort, igual à verificação de CRMV: uma falha de e-mail não pode
    // derrubar o cadastro. O tutor tem o botão "reenviar" no app.
    try {
      const token = await this.authToken.issue(
        tutor.id,
        AuthTokenPurpose.EMAIL_VERIFICATION,
      );
      await this.mail.sendEmailVerification(tutor.email, token);
    } catch (error) {
      this.logger.warn(
        `Cadastro de ${tutor.email} concluído sem enviar a verificação de e-mail: ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      );
    }
  }

  private buildTutorSession(tutor: Tutor) {
    return {
      access_token: this.signToken(tutor.id, tutor.email, Role.TUTOR),
      user: {
        id: tutor.id,
        name: tutor.name,
        email: tutor.email,
        phone: tutor.phone ?? undefined,
        profile_image_url: tutor.profileImageUrl ?? undefined,
        email_verified: tutor.emailVerifiedAt !== null,
        role: Role.TUTOR,
      },
    };
  }

  private signToken(id: string, email: string, role: Role): string {
    return this.jwtService.sign({
      sub: id,
      email,
      role,
    });
  }
}
