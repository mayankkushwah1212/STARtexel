import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'founder@newtech.io', description: 'User login email address' })
  @IsEmail({}, { message: 'Please provide a valid email address.' })
  email: string;

  @ApiProperty({ example: 'StrongPassword123!', description: 'Password (min 8 characters)', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long.' })
  password: string;

  @ApiProperty({ example: 'Jane', description: 'User first name' })
  @IsString()
  @IsNotEmpty({ message: 'First name is required.' })
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'User last name' })
  @IsString()
  @IsNotEmpty({ message: 'Last name is required.' })
  lastName: string;

  @ApiPropertyOptional({ example: '+1-555-019-9999', description: 'Contact phone number' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({
    enum: [Role.STARTUP, Role.DEPT],
    example: Role.STARTUP,
    description: 'Allowed public roles: STARTUP or DEPT only. ADMIN, EVALUATOR, AUDITOR are prohibited.',
  })
  @IsOptional()
  @IsIn([Role.STARTUP, Role.DEPT], {
    message: 'Public registration only allows STARTUP or DEPT roles.',
  })
  role?: Role;

  @ApiPropertyOptional({ example: 'b6f2c62c-8519-485a-8b14-97cfa9087cf2', description: 'Department UUID (for DEPT role)' })
  @IsOptional()
  @IsUUID('4', { message: 'departmentId must be a valid UUID.' })
  departmentId?: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', description: 'Startup UUID (for STARTUP role)' })
  @IsOptional()
  @IsUUID('4', { message: 'startupId must be a valid UUID.' })
  startupId?: string;
}
