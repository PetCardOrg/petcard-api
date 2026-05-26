import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Role } from './enums/role.enum';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
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

  private signToken(id: string, email: string, role: Role): string {
    return this.jwtService.sign({
      sub: id,
      email,
      role,
    });
  }
}
