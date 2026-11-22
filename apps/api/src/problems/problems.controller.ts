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
import { ProblemsService } from './problems.service';
import { CreateProblemDto } from './dto/create-problem.dto';
import { UpdateProblemDto } from './dto/update-problem.dto';
import { ProblemStatusTransitionDto } from './dto/problem-status-transition.dto';
import { QueryProblemsDto } from './dto/query-problems.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Problems')
@Controller('problems')
export class ProblemsController {
  constructor(private readonly problemsService: ProblemsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.DEPT)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a new public sector problem challenge (ADMIN or DEPT)' })
  @ApiResponse({ status: 201, description: 'Problem challenge created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error or missing department' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - DEPT or ADMIN role required' })
  async create(@Body() dto: CreateProblemDto, @CurrentUser() user: any) {
    return this.problemsService.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List published problem challenges with filters and pagination' })
  @ApiResponse({ status: 200, description: 'Paginated list of problem challenges' })
  async findAll(@Query() query: QueryProblemsDto) {
    return this.problemsService.findAll(query);
  }

  @Get(':idOrSlug')
  @ApiOperation({ summary: 'Get problem challenge details by UUID or URL slug' })
  @ApiParam({ name: 'idOrSlug', description: 'Problem UUID or slug' })
  @ApiResponse({ status: 200, description: 'Problem challenge details' })
  @ApiResponse({ status: 404, description: 'Problem challenge not found' })
  async findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.problemsService.findById(idOrSlug);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.DEPT)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update problem challenge details (Author or ADMIN)' })
  @ApiParam({ name: 'id', description: 'Problem UUID' })
  @ApiResponse({ status: 200, description: 'Problem challenge updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Problem not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProblemDto,
    @CurrentUser() user: any,
  ) {
    return this.problemsService.update(id, dto, user);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.DEPT)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Transition problem lifecycle status with state machine validation and cryptographic audit trail',
    description:
      'Validates status transition against state machine (DRAFT -> PUBLISHED -> IN_REVIEW -> PILOTING -> RESOLVED -> CLOSED). ' +
      'Rejects invalid transitions with 400. Records transition in immutable SHA-256 hash-chained audit log.',
  })
  @ApiParam({ name: 'id', description: 'Problem UUID' })
  @ApiResponse({ status: 200, description: 'Status successfully transitioned and audit record appended' })
  @ApiResponse({ status: 400, description: 'Invalid status transition rejected by state machine' })
  @ApiResponse({ status: 404, description: 'Problem not found' })
  async transitionStatus(
    @Param('id') id: string,
    @Body() dto: ProblemStatusTransitionDto,
    @CurrentUser() user: any,
  ) {
    return this.problemsService.transitionStatus(id, dto, user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.DEPT)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete a problem challenge (only if no proposals exist)' })
  @ApiParam({ name: 'id', description: 'Problem UUID' })
  @ApiResponse({ status: 200, description: 'Problem removed successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete problem with associated proposals' })
  @ApiResponse({ status: 404, description: 'Problem not found' })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.problemsService.remove(id, user);
  }
}
