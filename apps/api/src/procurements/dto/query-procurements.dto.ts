import { IsOptional, IsEnum, IsUUID, IsInt, Min, Max, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProcurementStatus, ProcurementType } from '@prisma/client';
import { Type } from 'class-transformer';

export class QueryProcurementsDto {
  @ApiPropertyOptional({ description: 'Filter by department UUID', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Filter by startup UUID', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  startupId?: string;

  @ApiPropertyOptional({ description: 'Filter by originating pilot UUID', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  pilotId?: string;

  @ApiPropertyOptional({ enum: ProcurementStatus, description: 'Filter by contract status' })
  @IsOptional()
  @IsEnum(ProcurementStatus)
  status?: ProcurementStatus;

  @ApiPropertyOptional({ enum: ProcurementType, description: 'Filter by award type' })
  @IsOptional()
  @IsEnum(ProcurementType)
  type?: ProcurementType;

  @ApiPropertyOptional({ description: 'Search contract number, title, or description' })
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
