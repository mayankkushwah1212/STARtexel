import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsObject,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EvaluationRecommendation } from '@prisma/client';
import { Type } from 'class-transformer';

export class UpdateEvaluationDto {
  @ApiPropertyOptional({ description: 'Technical score (0-100)', example: 89.0, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  technicalScore?: number;

  @ApiPropertyOptional({ description: 'Feasibility score (0-100)', example: 91.0, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  feasibilityScore?: number;

  @ApiPropertyOptional({ description: 'Cost score (0-100)', example: 82.0, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  costScore?: number;

  @ApiPropertyOptional({ description: 'Impact score (0-100)', example: 96.0, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  impactScore?: number;

  @ApiPropertyOptional({ description: 'Overall composite score (0-100)', example: 89.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  overallScore?: number;

  @ApiPropertyOptional({
    enum: EvaluationRecommendation,
    description: 'Updated recommendation verdict',
  })
  @IsOptional()
  @IsEnum(EvaluationRecommendation)
  recommendation?: EvaluationRecommendation;

  @ApiPropertyOptional({ description: 'Updated commentary' })
  @IsOptional()
  @IsString()
  comments?: string;

  @ApiPropertyOptional({
    description: 'Updated sub-criteria score breakdown JSON',
  })
  @IsOptional()
  @IsObject()
  criteriaFeedback?: Record<string, any>;
}
