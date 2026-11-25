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
import { PilotsService } from './pilots.service';
import { CreatePilotDto } from './dto/create-pilot.dto';
import { UpdatePilotDto } from './dto/update-pilot.dto';
import { PilotStatusTransitionDto } from './dto/pilot-status-transition.dto';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { SubmitMilestoneDto } from './dto/submit-milestone.dto';
import { VerifyMilestoneDto } from './dto/verify-milestone.dto';
import { QueryPilotsDto } from './dto/query-pilots.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Pilots')
@Controller('pilots')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class PilotsController {
  constructor(private readonly pilotsService: PilotsService) {}

  @Post()
  @Roles(Role.DEPT, Role.ADMIN)
  @ApiOperation({
    summary: 'Initiate a new pilot trial with phased milestones (DEPT or ADMIN)',
    description: 'Requires DEPT role (for their department) or ADMIN. Links to an accepted proposal.',
  })
  @ApiResponse({ status: 201, description: 'Pilot initiated and recorded in cryptographic audit trail' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 409, description: 'Pilot already exists for proposal' })
  async create(@Body() dto: CreatePilotDto, @CurrentUser() user: any) {
    return this.pilotsService.create(dto, user);
  }

  @Get()
  @Roles(Role.ADMIN, Role.DEPT, Role.STARTUP, Role.AUDITOR)
  @ApiOperation({
    summary: 'List pilots scoped by RBAC',
    description: 'STARTUP users see only their awarded pilots. DEPT users see pilots for their department. ADMIN/AUDITOR see all.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of scoped pilots' })
  async findAll(@Query() query: QueryPilotsDto, @CurrentUser() user: any) {
    return this.pilotsService.findAll(query, user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.DEPT, Role.STARTUP, Role.AUDITOR)
  @ApiOperation({ summary: 'Get pilot details, milestones, and procurement status by UUID' })
  @ApiParam({ name: 'id', description: 'Pilot UUID' })
  @ApiResponse({ status: 200, description: 'Pilot details with milestones' })
  @ApiResponse({ status: 403, description: 'Forbidden - Out of scope' })
  @ApiResponse({ status: 404, description: 'Pilot not found' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.pilotsService.findById(id, user);
  }

  @Patch(':id')
  @Roles(Role.DEPT, Role.ADMIN)
  @ApiOperation({ summary: 'Update pilot details (title, scope, dates, budgets, or KPIs)' })
  @ApiParam({ name: 'id', description: 'Pilot UUID' })
  @ApiResponse({ status: 200, description: 'Pilot updated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Pilot not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePilotDto,
    @CurrentUser() user: any,
  ) {
    return this.pilotsService.update(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(Role.DEPT, Role.ADMIN)
  @ApiOperation({
    summary: 'Transition pilot status (INITIATED -> IN_PROGRESS -> PAUSED -> COMPLETED -> GRADUATED / FAILED)',
    description: 'Enforces state machine and atomically records transition in hash-chained audit log.',
  })
  @ApiParam({ name: 'id', description: 'Pilot UUID' })
  @ApiResponse({ status: 200, description: 'Status successfully transitioned and audit record appended' })
  @ApiResponse({ status: 400, description: 'Invalid status transition rejected by state machine' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async transitionStatus(
    @Param('id') id: string,
    @Body() dto: PilotStatusTransitionDto,
    @CurrentUser() user: any,
  ) {
    return this.pilotsService.transitionStatus(id, dto, user);
  }

  @Post(':id/milestones')
  @Roles(Role.DEPT, Role.ADMIN)
  @ApiOperation({ summary: 'Add a new sequential milestone checkpoint to a pilot project' })
  @ApiParam({ name: 'id', description: 'Pilot UUID' })
  @ApiResponse({ status: 201, description: 'Milestone created and audited' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async addMilestone(
    @Param('id') id: string,
    @Body() dto: CreateMilestoneDto,
    @CurrentUser() user: any,
  ) {
    return this.pilotsService.addMilestone(id, dto, user);
  }

  @Patch(':id/milestones/:milestoneId/submit')
  @Roles(Role.STARTUP, Role.ADMIN)
  @ApiOperation({
    summary: 'Submit milestone outputs and deliverables for review (executing STARTUP vendor only)',
  })
  @ApiParam({ name: 'id', description: 'Pilot UUID' })
  @ApiParam({ name: 'milestoneId', description: 'Milestone UUID' })
  @ApiResponse({ status: 200, description: 'Milestone deliverables submitted and logged in audit chain' })
  @ApiResponse({ status: 400, description: 'Milestone not in valid state for submission' })
  @ApiResponse({ status: 403, description: 'Forbidden - Must be executing startup' })
  async submitMilestone(
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
    @Body() dto: SubmitMilestoneDto,
    @CurrentUser() user: any,
  ) {
    return this.pilotsService.submitMilestone(id, milestoneId, dto, user);
  }

  @Patch(':id/milestones/:milestoneId/verify')
  @Roles(Role.DEPT, Role.ADMIN)
  @ApiOperation({
    summary: 'Verify or reject milestone deliverables and authorize fund disbursement (DEPT/ADMIN only)',
  })
  @ApiParam({ name: 'id', description: 'Pilot UUID' })
  @ApiParam({ name: 'milestoneId', description: 'Milestone UUID' })
  @ApiResponse({ status: 200, description: 'Milestone verified and disbursement updated' })
  @ApiResponse({ status: 400, description: 'Invalid transition rejected' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async verifyMilestone(
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
    @Body() dto: VerifyMilestoneDto,
    @CurrentUser() user: any,
  ) {
    return this.pilotsService.verifyMilestone(id, milestoneId, dto, user);
  }
}
