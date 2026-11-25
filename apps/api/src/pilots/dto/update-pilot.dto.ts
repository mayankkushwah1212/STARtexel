import {
  IsString,
  IsOptional,
  IsNumber,
  IsUUID,
  IsDateString,
  Min,
  IsObject,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdatePilotDto {
  @ApiPropertyOptional({ description: 'Updated title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Updated scope' })
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional({ description: 'Scheduled conclusion date' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Actual end date upon conclusion' })
  @IsOptional()
  @IsDateString()
  actualEndDate?: string;

  @ApiPropertyOptional({ description: 'Updated allocated budget' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  allocatedBudget?: number;

  @ApiPropertyOptional({ description: 'Updated spent budget' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  spentBudget?: number;

  @ApiPropertyOptional({ description: 'Target KPIs JSON' })
  @IsOptional()
  @IsObject()
  kpiTargets?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Observed KPI results JSON' })
  @IsOptional()
  @IsObject()
  kpiResults?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Pilot manager user UUID', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  managerId?: string;
}
