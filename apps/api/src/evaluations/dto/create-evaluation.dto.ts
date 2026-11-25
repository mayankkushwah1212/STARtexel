import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsUUID,
  Min,
  Max,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EvaluationRecommendation, EvaluationStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateEvaluationDto {
  @ApiProperty({ description: 'Target proposal UUID being evaluated', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  proposalId: string;

  @ApiProperty({ description: 'Technical score (0-100)', example: 88.5, minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  technicalScore: number;

  @ApiProperty({ description: 'Feasibility score (0-100)', example: 92.0, minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  feasibilityScore: number;

  @ApiProperty({ description: 'Cost score (0-100)', example: 78.5, minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  costScore: number;

  @ApiProperty({ description: 'Impact score (0-100)', example: 95.0, minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  impactScore: number;

  @ApiPropertyOptional({
    description: 'Overall composite score (0-100, auto-calculated from sub-scores if omitted)',
    example: 88.5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  overallScore?: number;

  @ApiProperty({
    enum: EvaluationRecommendation,
    description: 'Evaluator recommendation verdict',
    example: EvaluationRecommendation.STRONGLY_ACCEPT,
  })
  @IsEnum(EvaluationRecommendation)
  @IsNotEmpty()
  recommendation: EvaluationRecommendation;

  @ApiProperty({
    description: 'Detailed evaluation commentary and review justification',
    example: 'Outstanding edge compute architecture. High feasibility with existing municipal infrastructure.',
  })
  @IsString()
  @IsNotEmpty()
  comments: string;

  @ApiPropertyOptional({
    description: 'Granular sub-criteria score breakdown and rubrics as JSON',
    example: {
      innovation: 92,
      scalability: 88,
      securityCompliance: 90,
      valueForMoney: 82,
    },
  })
  @IsOptional()
  @IsObject()
  criteriaFeedback?: Record<string, any>;

  @ApiPropertyOptional({
    enum: EvaluationStatus,
    description: 'Lifecycle status of evaluation (DRAFT or SUBMITTED)',
    default: EvaluationStatus.SUBMITTED,
  })
  @IsOptional()
  @IsEnum(EvaluationStatus)
  status?: EvaluationStatus = EvaluationStatus.SUBMITTED;
}
