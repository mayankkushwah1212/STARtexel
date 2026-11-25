import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsUUID,
  IsDateString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProcurementStatus, ProcurementType } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateProcurementDto {
  @ApiProperty({ description: 'Contract title', example: 'Metropolis Intelligent Transit Edge AI Scale Deployment' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'Detailed scope of procurement and delivery terms',
    example: 'City-wide rollout of 250 AI camera sensor nodes and back-office integration following successful pilot.',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    enum: ProcurementType,
    description: 'Procurement award route',
    example: ProcurementType.DIRECT_AWARD,
  })
  @IsEnum(ProcurementType)
  @IsNotEmpty()
  type: ProcurementType;

  @ApiProperty({ description: 'Originating completed pilot project UUID', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  pilotId: string;

  @ApiPropertyOptional({ description: 'Awardee startup UUID (defaults to pilot startup if not provided)', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  startupId?: string;

  @ApiPropertyOptional({ description: 'Procuring department UUID (defaults to user department)', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiProperty({ description: 'Total monetary contract value', example: 850000.0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  contractValue: number;

  @ApiProperty({ description: 'Contract execution commencement date', example: '2027-06-01T00:00:00Z' })
  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({ description: 'Contract term expiration date', example: '2029-05-31T23:59:59Z' })
  @IsDateString()
  @IsNotEmpty()
  endDate: string;

  @ApiPropertyOptional({
    description: 'Contractual terms and compliance clauses',
    example: 'Service Level Agreement guarantees 99.9% uptime with 4-hour MTTR.',
  })
  @IsOptional()
  @IsString()
  termsAndConditions?: string;

  @ApiPropertyOptional({
    description: 'Name and title of signatory government official',
    example: 'Marcus Vance, Director of Smart Transit Innovations',
  })
  @IsOptional()
  @IsString()
  approvalOfficer?: string;

  @ApiPropertyOptional({
    enum: ProcurementStatus,
    description: 'Initial contract status',
    default: ProcurementStatus.DRAFT,
  })
  @IsOptional()
  @IsEnum(ProcurementStatus)
  status?: ProcurementStatus = ProcurementStatus.DRAFT;
}
