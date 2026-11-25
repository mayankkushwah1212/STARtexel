import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EvaluationStatus } from '@prisma/client';

export class EvaluationStatusTransitionDto {
  @ApiProperty({
    enum: EvaluationStatus,
    description: 'Target evaluation lifecycle status (SUBMITTED, FINALIZED)',
    example: EvaluationStatus.FINALIZED,
  })
  @IsEnum(EvaluationStatus)
  @IsNotEmpty()
  status: EvaluationStatus;

  @ApiPropertyOptional({
    description: 'Optional reviewer sign-off notes or audit justification',
    example: 'Final scoring confirmed by panel lead.',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
