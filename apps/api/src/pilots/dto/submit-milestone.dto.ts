import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitMilestoneDto {
  @ApiProperty({
    description: 'Summary of outputs and deliverables submitted for verification',
    example: 'Deployed 20 sensor poles with encrypted LoRaWAN telemetry. Verified 99.8% uptime over 72 hours.',
  })
  @IsString()
  @IsNotEmpty()
  deliverables: string;

  @ApiPropertyOptional({
    description: 'Supplementary comments or operational notes from vendor',
  })
  @IsOptional()
  @IsString()
  comments?: string;
}
