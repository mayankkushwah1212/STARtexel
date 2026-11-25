import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MilestoneStatus, DisbursementStatus } from '@prisma/client';

export class VerifyMilestoneDto {
  @ApiProperty({
    enum: [MilestoneStatus.VERIFIED, MilestoneStatus.REJECTED],
    description: 'Verification outcome (VERIFIED or REJECTED)',
    example: MilestoneStatus.VERIFIED,
  })
  @IsEnum(MilestoneStatus)
  @IsNotEmpty()
  status: MilestoneStatus;

  @ApiProperty({
    description: 'Inspector / project manager feedback and audit justification',
    example: 'Independent sensor packet logs verified. Milestone successfully validated.',
  })
  @IsString()
  @IsNotEmpty()
  verificationFeedback: string;

  @ApiPropertyOptional({
    enum: DisbursementStatus,
    description: 'Optional disbursement status update for this milestone tranche',
    example: DisbursementStatus.APPROVED,
  })
  @IsOptional()
  @IsEnum(DisbursementStatus)
  disbursementStatus?: DisbursementStatus;
}
