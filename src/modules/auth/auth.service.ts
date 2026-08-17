import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { CreateVeterinarioDto } from '@petcardorg/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CrmvVerificationService } from '../veterinario/crmv/crmv-verification.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Role } from './enums/role.enum';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
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

    const token = this.signToken(tutor.id, tutor.email, tutor.role as Role);

    return {
      access_token: token,
      user: {
        id: tutor.id,
        name: tutor.name,
        email: tutor.email,
        role: tutor.role,
      },
    };
  }

  async login(dto: LoginDto) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { email: dto.email },
    });

    if (!tutor) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, tutor.password);

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.signToken(tutor.id, tutor.email, tutor.role as Role);

    return {
      access_token: token,
      user: {
        id: tutor.id,
        name: tutor.name,
        email: tutor.email,
        role: tutor.role,
      },
    };
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

    if (!vet) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, vet.password);

    if (!passwordValid) {
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
      role: Role.VET,
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
