import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProcurementStatus } from '@prisma/client';

export class ProcurementStatusTransitionDto {
  @ApiProperty({
    enum: ProcurementStatus,
    description: 'Target procurement lifecycle status',
    example: ProcurementStatus.PENDING_APPROVAL,
  })
  @IsEnum(ProcurementStatus)
  @IsNotEmpty()
  status: ProcurementStatus;

  @ApiPropertyOptional({
    description: 'Signatory official name (required for CONTRACT_SIGNED)',
    example: 'Sarah Jenkins, State Procurement Commissioner',
  })
  @IsOptional()
  @IsString()
  approvalOfficer?: string;

  @ApiPropertyOptional({
    description: 'Audit justification or transition notes',
    example: 'Contract signed by municipal authorities and vendor leadership.',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
