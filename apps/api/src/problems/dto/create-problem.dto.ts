import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  IsNumber,
  IsUUID,
  IsDateString,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProblemSeverity, ProblemStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateProblemDto {
  @ApiProperty({ description: 'Title of the problem challenge', example: 'Smart Traffic Flow Optimization' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  title: string;

  @ApiProperty({
    description: 'Detailed description of the public sector problem, constraints, and requirements',
    example: 'Municipal congestion along the central transit corridor requires adaptive real-time AI signal control.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  description: string;

  @ApiProperty({ description: 'Domain or category of the challenge', example: 'Urban Mobility' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category: string;

  @ApiPropertyOptional({ enum: ProblemSeverity, default: ProblemSeverity.MEDIUM })
  @IsOptional()
  @IsEnum(ProblemSeverity)
  severity?: ProblemSeverity = ProblemSeverity.MEDIUM;

  @ApiPropertyOptional({ enum: ProblemStatus, default: ProblemStatus.PUBLISHED })
  @IsOptional()
  @IsEnum(ProblemStatus)
  status?: ProblemStatus = ProblemStatus.PUBLISHED;

  @ApiPropertyOptional({ description: 'Department UUID (defaults to user department if not specified)', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Allocated budget for challenge pilot', example: 150000.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budget?: number;

  @ApiPropertyOptional({ description: 'Proposal submission deadline', example: '2026-12-31T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  deadline?: string;

  @ApiPropertyOptional({ description: 'Vendor eligibility prerequisites and compliance requirements' })
  @IsOptional()
  @IsString()
  eligibilityCriteria?: string;

  @ApiPropertyOptional({ description: 'Target deliverables and measurable success metrics' })
  @IsOptional()
  @IsString()
  expectedOutcomes?: string;

  @ApiPropertyOptional({ description: 'Tags / keywords for indexing and search', example: ['traffic', 'ai', 'iot'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[] = [];
}
