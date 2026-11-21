import {
  Controller,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
  NotFoundException,
  ConflictException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role, UserStatus } from '@prisma/client';
import { CreateUserAdminDto } from './dto/create-user-admin.dto';
import * as bcrypt from 'bcrypt';

function sanitizeUser(user: any) {
  const { passwordHash, ...sanitized } = user;
  return sanitized;
}

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminUsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Patch(':id/approve')
  async approveUser(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found.`);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.ACTIVE },
    });

    return {
      message: 'User approved successfully.',
      user: sanitizeUser(updatedUser),
    };
  }

  @Post()
  async createUser(@Body() dto: CreateUserAdminDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException('A user with this email address already exists.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phoneNumber: dto.phoneNumber?.trim() || null,
        role: dto.role,
        status: dto.status || UserStatus.ACTIVE,
        departmentId: dto.departmentId || null,
        startupId: dto.startupId || null,
      },
    });

    return {
      message: 'User created successfully.',
      user: sanitizeUser(user),
    };
  }
}
