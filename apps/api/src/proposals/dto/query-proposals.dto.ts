import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProposalStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class QueryProposalsDto {
  @ApiPropertyOptional({ description: 'Filter by problem UUID' })
  @IsOptional()
  @IsUUID()
  problemId?: string;

  @ApiPropertyOptional({ description: 'Filter by startup UUID (Admin/Auditor/Evaluator only)' })
  @IsOptional()
  @IsUUID()
  startupId?: string;

  @ApiPropertyOptional({ enum: ProposalStatus, description: 'Filter by proposal lifecycle status' })
  @IsOptional()
  @IsEnum(ProposalStatus)
  status?: ProposalStatus;

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
