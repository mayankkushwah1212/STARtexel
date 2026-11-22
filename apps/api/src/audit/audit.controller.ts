import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { AuditService } from './audit.service';

@ApiTags('Audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('verify')
  @ApiOperation({
    summary: 'Verify cryptographic integrity of the audit log SHA-256 hash chain',
    description:
      'Traverses the full audit log chain sequentially from GENESIS to the latest record, recomputing every SHA-256 hash and verifying link continuity. Pinpoints any tampered records.',
  })
  @ApiResponse({
    status: 200,
    description: 'Chain verification result (valid: true or details of first broken link)',
  })
  async verifyChain() {
    return this.auditService.verifyChain();
  }

  @Get('logs')
  @ApiOperation({ summary: 'Retrieve recent audit log records' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of records (default 50)' })
  @ApiResponse({ status: 200, description: 'List of recent audit logs' })
  async getRecentLogs(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.auditService.getRecentLogs(parsedLimit);
  }
}
