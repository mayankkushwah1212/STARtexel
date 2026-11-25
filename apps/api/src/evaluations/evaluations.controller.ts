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
import { EvaluationsService } from './evaluations.service';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { UpdateEvaluationDto } from './dto/update-evaluation.dto';
import { EvaluationStatusTransitionDto } from './dto/evaluation-status-transition.dto';
import { QueryEvaluationsDto } from './dto/query-evaluations.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Evaluations')
@Controller('evaluations')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class EvaluationsController {
  constructor(private readonly evaluationsService: EvaluationsService) {}

  @Post()
  @Roles(Role.EVALUATOR)
  @ApiOperation({
    summary: 'Submit or draft an evaluation for a startup proposal with score JSON (EVALUATOR only)',
    description: 'Requires an assigned EVALUATOR account and proposal in UNDER_REVIEW status. Rejects duplicate evaluations and invalid proposal states.',
  })
  @ApiResponse({ status: 201, description: 'Evaluation created and hashed in audit chain' })
  @ApiResponse({ status: 400, description: 'Proposal not in reviewable status or validation error' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only evaluators and admins may evaluate' })
  @ApiResponse({ status: 409, description: 'Evaluation already submitted for this proposal by evaluator' })
  async create(@Body() dto: CreateEvaluationDto, @CurrentUser() user: any) {
    return this.evaluationsService.create(dto, user);
  }

  @Get()
  @Roles(Role.ADMIN, Role.DEPT, Role.EVALUATOR, Role.AUDITOR)
  @ApiOperation({
    summary: 'List evaluations scoped by RBAC',
    description: 'EVALUATORS see their own evaluations. DEPT officers see evaluations for their department. ADMIN/AUDITOR see all. Startups forbidden.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of evaluations' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async findAll(@Query() query: QueryEvaluationsDto, @CurrentUser() user: any) {
    return this.evaluationsService.findAll(query, user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.DEPT, Role.EVALUATOR, Role.AUDITOR)
  @ApiOperation({ summary: 'Get evaluation details by UUID' })
  @ApiParam({ name: 'id', description: 'Evaluation UUID' })
  @ApiResponse({ status: 200, description: 'Evaluation details' })
  @ApiResponse({ status: 403, description: 'Forbidden - Out of scope' })
  @ApiResponse({ status: 404, description: 'Evaluation not found' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.evaluationsService.findById(id, user);
  }

  @Patch(':id')
  @Roles(Role.EVALUATOR, Role.ADMIN)
  @ApiOperation({ summary: 'Update scores, comments, or criteria feedback on a draft/submitted evaluation' })
  @ApiParam({ name: 'id', description: 'Evaluation UUID' })
  @ApiResponse({ status: 200, description: 'Evaluation updated successfully' })
  @ApiResponse({ status: 400, description: 'Cannot update a FINALIZED evaluation' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Evaluation not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEvaluationDto,
    @CurrentUser() user: any,
  ) {
    return this.evaluationsService.update(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(Role.EVALUATOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Transition evaluation status (DRAFT -> SUBMITTED -> FINALIZED) with hash-chained audit record',
  })
  @ApiParam({ name: 'id', description: 'Evaluation UUID' })
  @ApiResponse({ status: 200, description: 'Evaluation status transitioned and logged' })
  @ApiResponse({ status: 400, description: 'Invalid status transition rejected by state machine' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Evaluation not found' })
  async transitionStatus(
    @Param('id') id: string,
    @Body() dto: EvaluationStatusTransitionDto,
    @CurrentUser() user: any,
  ) {
    return this.evaluationsService.transitionStatus(id, dto, user);
  }
}
