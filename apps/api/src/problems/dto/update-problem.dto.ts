import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsNumber,
  IsDateString,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProblemSeverity } from '@prisma/client';
import { Type } from 'class-transformer';

export class UpdateProblemDto {
  @ApiPropertyOptional({ description: 'Updated title of the problem challenge' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ description: 'Updated detailed description' })
  @IsOptional()
  @IsString()
  @MinLength(10)
  description?: string;

  @ApiPropertyOptional({ description: 'Updated domain or category' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ enum: ProblemSeverity })
  @IsOptional()
  @IsEnum(ProblemSeverity)
  severity?: ProblemSeverity;

  @ApiPropertyOptional({ description: 'Updated allocated budget', example: 175000.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budget?: number;

  @ApiPropertyOptional({ description: 'Updated proposal submission deadline', example: '2026-12-31T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  deadline?: string;

  @ApiPropertyOptional({ description: 'Updated eligibility criteria' })
  @IsOptional()
  @IsString()
  eligibilityCriteria?: string;

  @ApiPropertyOptional({ description: 'Updated expected outcomes' })
  @IsOptional()
  @IsString()
  expectedOutcomes?: string;

  @ApiPropertyOptional({ description: 'Updated tags', example: ['traffic', 'sensors', 'smart-city'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
