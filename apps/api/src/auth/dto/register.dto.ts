import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength, IsIn } from 'class-validator';
import { Role } from '@prisma/client';

export class RegisterDto {
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

  @IsOptional()
  @IsIn([Role.STARTUP, Role.DEPT], {
    message: 'Public registration only allows STARTUP or DEPT roles.',
  })
  role?: Role;

  @IsOptional()
  @IsUUID('4', { message: 'departmentId must be a valid UUID.' })
  departmentId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'startupId must be a valid UUID.' })
  startupId?: string;
}
