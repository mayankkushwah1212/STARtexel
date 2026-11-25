import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsNumber,
  IsDateString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateMilestoneDto {
  @ApiProperty({ description: 'Milestone title', example: 'Field Sensor Deployment & Telemetry Test' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'Work items, deliverables description, and acceptance criteria',
    example: 'Deploy 20 optical units across pilot corridor and stream live telemetry to urban operations centre.',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ description: 'Sequential milestone order (1, 2, 3...)', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderIndex: number;

  @ApiProperty({ description: 'Milestone due date', example: '2027-02-28T23:59:59Z' })
  @IsDateString()
  @IsNotEmpty()
  dueDate: string;

  @ApiPropertyOptional({
    description: 'Inspection and verification criteria for milestone verification',
    example: 'Optical telemetry packet loss below 0.1% over continuous 72-hour test run.',
  })
  @IsOptional()
  @IsString()
  verificationCriteria?: string;

  @ApiPropertyOptional({
    description: 'Disbursement tranche amount upon verified completion',
    example: 45000.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  disbursementAmount?: number;
}
