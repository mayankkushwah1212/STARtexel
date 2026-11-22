import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProblemStatus } from '@prisma/client';

export class ProblemStatusTransitionDto {
  @ApiProperty({
    enum: ProblemStatus,
    description: 'Target problem status in accordance with the state machine graph',
    example: ProblemStatus.IN_REVIEW,
  })
  @IsEnum(ProblemStatus)
  @IsNotEmpty()
  status: ProblemStatus;

  @ApiPropertyOptional({
    description: 'Justification or administrative notes for this status transition',
    example: 'Proposal deadline reached; moving challenge to evaluation review.',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
