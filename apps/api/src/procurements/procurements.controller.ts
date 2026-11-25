import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { ProcurementsService } from './procurements.service';
import { CreateProcurementDto } from './dto/create-procurement.dto';
import { UpdateProcurementDto } from './dto/update-procurement.dto';
import { ProcurementStatusTransitionDto } from './dto/procurement-status-transition.dto';
import { QueryProcurementsDto } from './dto/query-procurements.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Procurements')
@Controller('procurements')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class ProcurementsController {
  constructor(private readonly procurementsService: ProcurementsService) {}

  @Post()
  @Roles(Role.DEPT, Role.ADMIN)
  @ApiOperation({
    summary: 'Award or draft a public procurement contract (DEPT or ADMIN)',
    description: 'Requires DEPT role (for their department) or ADMIN. Can link to a graduated pilot.',
  })
  @ApiResponse({ status: 201, description: 'Procurement contract drafted and recorded in cryptographic audit chain' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Forbidden - DEPT or ADMIN required' })
  async create(@Body() dto: CreateProcurementDto, @CurrentUser() user: any) {
    return this.procurementsService.create(dto, user);
  }

  @Get()
  @Roles(Role.ADMIN, Role.DEPT, Role.STARTUP, Role.AUDITOR)
  @ApiOperation({
    summary: 'List procurement contracts scoped by RBAC',
    description: 'STARTUP users only view contracts awarded to their startup. DEPT users view their department contracts. ADMIN/AUDITOR view all.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of contracts' })
  async findAll(@Query() query: QueryProcurementsDto, @CurrentUser() user: any) {
    return this.procurementsService.findAll(query, user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.DEPT, Role.STARTUP, Role.AUDITOR)
  @ApiOperation({ summary: 'Get procurement contract details by UUID (enforcing startup isolation)' })
  @ApiParam({ name: 'id', description: 'Contract UUID' })
  @ApiResponse({ status: 200, description: 'Contract details' })
  @ApiResponse({ status: 403, description: 'Forbidden - Out of scope' })
  @ApiResponse({ status: 404, description: 'Contract not found' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.procurementsService.findById(id, user);
  }

  @Patch(':id')
  @Roles(Role.DEPT, Role.ADMIN)
  @ApiOperation({ summary: 'Update contract terms, value, or dates (only in DRAFT or PENDING_APPROVAL status)' })
  @ApiParam({ name: 'id', description: 'Contract UUID' })
  @ApiResponse({ status: 200, description: 'Contract updated' })
  @ApiResponse({ status: 400, description: 'Contract cannot be modified in active or finalized states' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Contract not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProcurementDto,
    @CurrentUser() user: any,
  ) {
    return this.procurementsService.update(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(Role.DEPT, Role.ADMIN, Role.STARTUP)
  @ApiOperation({
    summary: 'Transition procurement contract lifecycle status (DRAFT -> PENDING_APPROVAL -> APPROVED -> CONTRACT_SIGNED -> FULFILLED / TERMINATED)',
    description: 'Enforces state machine and atomically logs transition in SHA-256 hash-chained audit log.',
  })
  @ApiParam({ name: 'id', description: 'Contract UUID' })
  @ApiResponse({ status: 200, description: 'Status transitioned and audit record appended' })
  @ApiResponse({ status: 400, description: 'Invalid transition rejected by state machine' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async transitionStatus(
    @Param('id') id: string,
    @Body() dto: ProcurementStatusTransitionDto,
    @CurrentUser() user: any,
  ) {
    return this.procurementsService.transitionStatus(id, dto, user);
  }
}
