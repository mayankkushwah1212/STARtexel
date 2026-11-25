import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProcurementType } from '@prisma/client';
import { Type } from 'class-transformer';

export class UpdateProcurementDto {
  @ApiPropertyOptional({ description: 'Contract title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Scope and delivery terms' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ProcurementType, description: 'Procurement award type' })
  @IsOptional()
  @IsEnum(ProcurementType)
  type?: ProcurementType;

  @ApiPropertyOptional({ description: 'Updated contract value' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  contractValue?: number;

  @ApiPropertyOptional({ description: 'Commencement date' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Expiration date' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Terms and conditions' })
  @IsOptional()
  @IsString()
  termsAndConditions?: string;

  @ApiPropertyOptional({ description: 'Approval officer name and title' })
  @IsOptional()
  @IsString()
  approvalOfficer?: string;
}
