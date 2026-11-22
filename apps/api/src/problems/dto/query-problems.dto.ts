import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProblemSeverity, ProblemStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class QueryProblemsDto {
  @ApiPropertyOptional({ enum: ProblemStatus, description: 'Filter by problem status' })
  @IsOptional()
  @IsEnum(ProblemStatus)
  status?: ProblemStatus;

  @ApiPropertyOptional({ description: 'Filter by category/domain' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: ProblemSeverity, description: 'Filter by challenge severity' })
  @IsOptional()
  @IsEnum(ProblemSeverity)
  severity?: ProblemSeverity;

  @ApiPropertyOptional({ description: 'Filter by issuing department UUID' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Search term matching title or description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100, description: 'Records per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
