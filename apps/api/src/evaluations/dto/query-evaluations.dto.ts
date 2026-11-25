import { IsOptional, IsEnum, IsUUID, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EvaluationRecommendation, EvaluationStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class QueryEvaluationsDto {
  @ApiPropertyOptional({ description: 'Filter by proposal UUID', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  proposalId?: string;

  @ApiPropertyOptional({ description: 'Filter by evaluator UUID', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  evaluatorId?: string;

  @ApiPropertyOptional({ enum: EvaluationStatus, description: 'Filter by status' })
  @IsOptional()
  @IsEnum(EvaluationStatus)
  status?: EvaluationStatus;

  @ApiPropertyOptional({ enum: EvaluationRecommendation, description: 'Filter by recommendation' })
  @IsOptional()
  @IsEnum(EvaluationRecommendation)
  recommendation?: EvaluationRecommendation;

  @ApiPropertyOptional({ description: 'Page number (default 1)', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Number of items per page (default 10)', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
