import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  Min,
  Max,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdateProposalDto {
  @ApiPropertyOptional({ description: 'Updated solution title' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ description: 'Updated executive summary' })
  @IsOptional()
  @IsString()
  @MinLength(10)
  summary?: string;

  @ApiPropertyOptional({ description: 'Updated technical architecture' })
  @IsOptional()
  @IsString()
  @MinLength(10)
  technicalApproach?: string;

  @ApiPropertyOptional({ description: 'Updated requested budget', example: 140000.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budget?: number;

  @ApiPropertyOptional({ description: 'Updated duration in months', example: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  durationMonths?: number;
}
