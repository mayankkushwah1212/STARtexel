import {
  Controller,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role, UserStatus } from '@prisma/client';
import { CreateUserAdminDto } from './dto/create-user-admin.dto';
import * as bcrypt from 'bcrypt';

function sanitizeUser(user: any) {
  const { passwordHash, ...sanitized } = user;
  return sanitized;
}

@ApiTags('Admin')
@ApiBearerAuth('JWT-auth')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminUsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve a PENDING user (ADMIN only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User approved and set to ACTIVE status' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - ADMIN role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async approveUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() adminUser?: any,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found.`);
    }

    const previousStatus = user.status;
    const newStatus = UserStatus.ACTIVE;

    const { entity: updatedUser } = await this.auditService.transitionState({
      entity: 'User',
      entityId: id,
      fromState: previousStatus,
      toState: newStatus,
      actorId: adminUser?.id || null,
      action: 'USER_APPROVED',
      metadata: {
        email: user.email,
        role: user.role,
        approvedAt: new Date().toISOString(),
      },
      updateFn: async (tx) => {
        return tx.user.update({
          where: { id },
          data: { status: newStatus },
        });
      },
    });

    return {
      message: 'User approved successfully.',
      user: sanitizeUser(updatedUser),
    };
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Transition user status with hash-chained audit logging (ADMIN only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User status transitioned and audit logged' })
  @ApiResponse({ status: 400, description: 'Invalid status' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async transitionUserStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') newStatus: UserStatus,
    @CurrentUser() adminUser?: any,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found.`);
    }

    if (!newStatus || !Object.values(UserStatus).includes(newStatus)) {
      throw new BadRequestException(`Invalid status: ${newStatus}`);
    }

    const previousStatus = user.status;

    const { entity: updatedUser } = await this.auditService.transitionState({
      entity: 'User',
      entityId: id,
      fromState: previousStatus,
      toState: newStatus,
      actorId: adminUser?.id || null,
      action: 'USER_STATUS_TRANSITION',
      metadata: {
        email: user.email,
        role: user.role,
      },
      updateFn: async (tx) => {
        return tx.user.update({
          where: { id },
          data: { status: newStatus },
        });
      },
    });

    return {
      message: `User status changed from ${previousStatus} to ${newStatus}.`,
      user: sanitizeUser(updatedUser),
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create user account directly with any role (ADMIN only)' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - ADMIN role required' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
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
