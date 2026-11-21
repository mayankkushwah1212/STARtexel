import {
  Injectable,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is missing.');
    }
  }

  async register(dto: RegisterDto) {
    // Public registration only allows STARTUP or DEPT roles
    if (dto.role && dto.role !== Role.STARTUP && dto.role !== Role.DEPT) {
      throw new BadRequestException('Public registration only allows STARTUP or DEPT roles.');
    }

    const targetRole = dto.role || Role.STARTUP;
    const normalizedEmail = dto.email.toLowerCase().trim();

    // Check existing email
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException('A user with this email address already exists.');
    }

    // Hash password with bcrypt (10 rounds)
    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Create user with PENDING status
    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phoneNumber: dto.phoneNumber?.trim() || null,
        role: targetRole,
        status: UserStatus.PENDING,
        departmentId: targetRole === Role.DEPT ? dto.departmentId || null : null,
        startupId: targetRole === Role.STARTUP ? dto.startupId || null : null,
      },
    });

    // Return sanitized user (never returning passwordHash)
    return {
      message: 'Registration successful. Account is pending administrator approval.',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
      },
    };
  }

  async login(dto: LoginDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    // Verify account status
    if (user.status === UserStatus.PENDING) {
      throw new UnauthorizedException('Your account is pending administrator approval.');
    }

    if (user.status === UserStatus.INACTIVE || user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Your account has been deactivated or suspended.');
    }

    // Generate JWT token
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    // Update lastLoginAt
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Return sanitized response (never returning passwordHash)
    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        departmentId: user.departmentId,
        startupId: user.startupId,
      },
    };
  }
}
