import { IsOptional, IsEnum, IsUUID, IsInt, Min, Max, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PilotStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class QueryPilotsDto {
  @ApiPropertyOptional({ description: 'Filter by sponsoring department UUID', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Filter by startup vendor UUID', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  startupId?: string;

  @ApiPropertyOptional({ description: 'Filter by problem challenge UUID', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  problemId?: string;

  @ApiPropertyOptional({ enum: PilotStatus, description: 'Filter by pilot status' })
  @IsOptional()
  @IsEnum(PilotStatus)
  status?: PilotStatus;

  @ApiPropertyOptional({ description: 'Search title, code, or scope' })
  @IsOptional()
  @IsString()
  search?: string;

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
