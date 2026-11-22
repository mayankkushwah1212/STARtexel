import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProposalStatus } from '@prisma/client';

export class ProposalStatusTransitionDto {
  @ApiProperty({
    enum: ProposalStatus,
    description: 'Target proposal status according to the state machine graph',
    example: ProposalStatus.UNDER_REVIEW,
  })
  @IsEnum(ProposalStatus)
  @IsNotEmpty()
  status: ProposalStatus;

  @ApiPropertyOptional({
    description: 'Administrative or evaluation rationale for the transition',
    example: 'Evaluator panel completed scoring; threshold met for shortlisting.',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
