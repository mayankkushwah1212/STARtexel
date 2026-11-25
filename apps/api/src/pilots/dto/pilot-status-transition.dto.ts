import { IsEnum, IsNotEmpty, IsOptional, IsString, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PilotStatus } from '@prisma/client';

export class PilotStatusTransitionDto {
  @ApiProperty({
    enum: PilotStatus,
    description: 'Target pilot lifecycle status (INITIATED, IN_PROGRESS, PAUSED, COMPLETED, FAILED, GRADUATED)',
    example: PilotStatus.IN_PROGRESS,
  })
  @IsEnum(PilotStatus)
  @IsNotEmpty()
  status: PilotStatus;

  @ApiPropertyOptional({
    description: 'Audit justification or operational notes',
    example: 'Pilot trial kicked off with initial hardware deployment.',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Optional observed KPI outcomes at transition time',
    example: { classificationAccuracy: 0.985, systemUptime: 0.998 },
  })
  @IsOptional()
  @IsObject()
  kpiResults?: Record<string, any>;
}
