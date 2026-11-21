import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { Role, UserStatus } from '@prisma/client';

export class CreateUserAdminDto {
  @IsEmail({}, { message: 'Please provide a valid email address.' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long.' })
  password: string;

  @IsString()
  @IsNotEmpty({ message: 'First name is required.' })
  firstName: string;

  @IsString()
  @IsNotEmpty({ message: 'Last name is required.' })
  lastName: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsEnum(Role, { message: 'Role must be one of: ADMIN, DEPT, STARTUP, EVALUATOR, AUDITOR' })
  role: Role;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsUUID('4', { message: 'departmentId must be a valid UUID.' })
  departmentId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'startupId must be a valid UUID.' })
  startupId?: string;
}
