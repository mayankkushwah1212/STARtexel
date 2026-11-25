import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsUUID,
  IsDateString,
  Min,
  IsArray,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PilotStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { CreateMilestoneDto } from './create-milestone.dto';

export class CreatePilotDto {
  @ApiProperty({ description: 'Originating proposal UUID', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  proposalId: string;

  @ApiProperty({ description: 'Pilot project title', example: 'Metropolis Bus Rapid Transit Adaptive Sensor Pilot' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'Detailed scope, deployment boundaries, and operational trial environment',
    example: 'Deploy edge TPUs on 15 high-density bus transit lanes to validate automated camera enforcement.',
  })
  @IsString()
  @IsNotEmpty()
  scope: string;

  @ApiProperty({ description: 'Official pilot commencement date', example: '2026-12-01T00:00:00Z' })
  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({ description: 'Scheduled conclusion date', example: '2027-05-31T23:59:59Z' })
  @IsDateString()
  @IsNotEmpty()
  endDate: string;

  @ApiProperty({ description: 'Total allocated trial budget', example: 120000.0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  allocatedBudget: number;

  @ApiPropertyOptional({
    description: 'Target KPIs and metrics (JSON)',
    example: { classificationAccuracy: 0.98, systemUptime: 0.995, latencyMs: 150 },
  })
  @IsOptional()
  @IsObject()
  kpiTargets?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Department pilot manager UUID', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  managerId?: string;

  @ApiPropertyOptional({ description: 'Sponsoring department UUID (optional if set on user)', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({
    enum: PilotStatus,
    description: 'Initial pilot status',
    default: PilotStatus.INITIATED,
  })
  @IsOptional()
  @IsEnum(PilotStatus)
  status?: PilotStatus = PilotStatus.INITIATED;

  @ApiPropertyOptional({
    type: [CreateMilestoneDto],
    description: 'Initial milestones to track during pilot execution',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMilestoneDto)
  milestones?: CreateMilestoneDto[];
}
