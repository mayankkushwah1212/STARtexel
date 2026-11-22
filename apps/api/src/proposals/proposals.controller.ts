import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { ProposalsService } from './proposals.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { UpdateProposalDto } from './dto/update-proposal.dto';
import { ProposalStatusTransitionDto } from './dto/proposal-status-transition.dto';
import { QueryProposalsDto } from './dto/query-proposals.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Proposals')
@Controller('proposals')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class ProposalsController {
  constructor(private readonly proposalsService: ProposalsService) {}

  @Post()
  @Roles(Role.STARTUP, Role.ADMIN)
  @ApiOperation({
    summary: 'Submit a new startup proposal for a published challenge (ACTIVE STARTUP only)',
    description: 'Requires an ACTIVE STARTUP account. Rejects submissions if user status is PENDING/INACTIVE or if problem is closed.',
  })
  @ApiResponse({ status: 201, description: 'Proposal successfully created / submitted' })
  @ApiResponse({ status: 400, description: 'Validation error or target problem is closed/draft' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only active startup accounts may submit' })
  async create(@Body() dto: CreateProposalDto, @CurrentUser() user: any) {
    return this.proposalsService.create(dto, user);
  }

  @Get()
  @Roles(Role.ADMIN, Role.DEPT, Role.STARTUP, Role.EVALUATOR, Role.AUDITOR)
  @ApiOperation({
    summary: 'List proposals scoped by RBAC',
    description: 'STARTUP users can only view their own proposals. DEPT users see proposals submitted to their department problems. ADMIN/AUDITOR/EVALUATOR see all.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of scoped proposals' })
  async findAll(@Query() query: QueryProposalsDto, @CurrentUser() user: any) {
    return this.proposalsService.findAll(query, user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.DEPT, Role.STARTUP, Role.EVALUATOR, Role.AUDITOR)
  @ApiOperation({ summary: 'Get proposal details by UUID (enforcing startup isolation and department scoping)' })
  @ApiParam({ name: 'id', description: 'Proposal UUID' })
  @ApiResponse({ status: 200, description: 'Proposal details' })
  @ApiResponse({ status: 403, description: 'Forbidden - Access denied to other startup proposals' })
  @ApiResponse({ status: 404, description: 'Proposal not found' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.proposalsService.findById(id, user);
  }

  @Patch(':id')
  @Roles(Role.STARTUP, Role.ADMIN)
  @ApiOperation({ summary: 'Update proposal details (only in DRAFT or SUBMITTED status by authoring startup)' })
  @ApiParam({ name: 'id', description: 'Proposal UUID' })
  @ApiResponse({ status: 200, description: 'Proposal updated successfully' })
  @ApiResponse({ status: 400, description: 'Proposal is under review or finalized and cannot be modified' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Proposal not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProposalDto,
    @CurrentUser() user: any,
  ) {
    return this.proposalsService.update(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(Role.STARTUP, Role.DEPT, Role.EVALUATOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Transition proposal lifecycle status with state machine enforcement and cryptographic audit trail',
    description:
      'Validates transitions (DRAFT -> SUBMITTED -> UNDER_REVIEW -> SHORTLISTED -> ACCEPTED / REJECTED / WITHDRAWN). ' +
      'Rejects invalid transitions with 400. Records transition atomically in SHA-256 hash-chained audit log.',
  })
  @ApiParam({ name: 'id', description: 'Proposal UUID' })
  @ApiResponse({ status: 200, description: 'Proposal status transitioned and audit record appended' })
  @ApiResponse({ status: 400, description: 'Invalid status transition rejected by state machine' })
  @ApiResponse({ status: 403, description: 'Forbidden - Role cannot perform this transition' })
  @ApiResponse({ status: 404, description: 'Proposal not found' })
  async transitionStatus(
    @Param('id') id: string,
    @Body() dto: ProposalStatusTransitionDto,
    @CurrentUser() user: any,
  ) {
    return this.proposalsService.transitionStatus(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.STARTUP, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a draft proposal (only DRAFT status or ADMIN)' })
  @ApiParam({ name: 'id', description: 'Proposal UUID' })
  @ApiResponse({ status: 200, description: 'Proposal removed successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete submitted proposal; use WITHDRAWN transition instead' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Proposal not found' })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.proposalsService.remove(id, user);
  }
}
