import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsUUID,
  IsInt,
  Min,
  Max,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProposalStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateProposalDto {
  @ApiProperty({ description: 'Target problem UUID being addressed', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  problemId: string;

  @ApiProperty({ description: 'Proposed solution title', example: 'AeroTraffic AI Adaptive Signal Platform' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  title: string;

  @ApiProperty({
    description: 'Executive summary of proposed innovation',
    example: 'An end-to-end edge AI platform dynamically sequencing intersections using optical computer vision.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  summary: string;

  @ApiProperty({
    description: 'Detailed architecture, hardware specs, and implementation approach',
    example: 'Deploy edge tensor processing units with YOLOR cameras connected over private 5G mesh network.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  technicalApproach: string;

  @ApiProperty({ description: 'Requested pilot budget (Decimal 12, 2)', example: 135000.0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budget: number;

  @ApiProperty({ description: 'Estimated implementation duration in months (1-120)', example: 6 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  durationMonths: number;

  @ApiPropertyOptional({ description: 'Startup UUID (defaults to user startup if not provided)', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  startupId?: string;

  @ApiPropertyOptional({ enum: ProposalStatus, default: ProposalStatus.SUBMITTED })
  @IsOptional()
  @IsEnum(ProposalStatus)
  status?: ProposalStatus = ProposalStatus.SUBMITTED;
}
