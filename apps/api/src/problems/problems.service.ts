import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateProblemDto } from './dto/create-problem.dto';
import { UpdateProblemDto } from './dto/update-problem.dto';
import { ProblemStatusTransitionDto } from './dto/problem-status-transition.dto';
import { QueryProblemsDto } from './dto/query-problems.dto';
import { validateProblemTransition } from './problems.state-machine';
import { Role } from '@prisma/client';
import * as crypto from 'crypto';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class ProblemsService {
  private readonly logger = new Logger(ProblemsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateProblemDto, currentUser: any) {
    let departmentId = dto.departmentId;

    if (!departmentId) {
      if (currentUser?.departmentId) {
        departmentId = currentUser.departmentId;
      } else {
        const firstDept = await this.prisma.department.findFirst();
        if (!firstDept) {
          throw new BadRequestException('No department found. Please create a department first.');
        }
        departmentId = firstDept.id;
      }
    }

    // Verify department exists
    const dept = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!dept) {
      throw new NotFoundException(`Department with ID ${departmentId} not found.`);
    }

    // Generate unique slug and reference code
    const baseSlug = slugify(dto.title);
    const uniqueSuffix = crypto.randomBytes(3).toString('hex');
    const slug = `${baseSlug}-${uniqueSuffix}`;
    const year = new Date().getFullYear();
    const count = await this.prisma.problem.count();
    const code = `PRB-${year}-${String(count + 1).padStart(3, '0')}`;

    const problem = await this.prisma.problem.create({
      data: {
        title: dto.title.trim(),
        slug,
        code,
        description: dto.description.trim(),
        category: dto.category.trim(),
        severity: dto.severity,
        status: dto.status,
        departmentId,
        createdById: currentUser.id,
        budget: dto.budget !== undefined ? dto.budget : null,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        eligibilityCriteria: dto.eligibilityCriteria?.trim() || null,
        expectedOutcomes: dto.expectedOutcomes?.trim() || null,
        tags: dto.tags || [],
      },
      include: {
        department: {
          select: { id: true, name: true, code: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    // Record creation event in audit trail
    await this.auditService.record({
      actorId: currentUser.id,
      action: 'PROBLEM_CREATED',
      entity: 'Problem',
      entityId: problem.id,
      payload: {
        code: problem.code,
        title: problem.title,
        category: problem.category,
        severity: problem.severity,
        status: problem.status,
        departmentId: problem.departmentId,
      },
    });

    return problem;
  }

  async findAll(query: QueryProblemsDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.status) {
      where.status = query.status;
    }
    if (query.category) {
      where.category = { contains: query.category, mode: 'insensitive' };
    }
    if (query.severity) {
      where.severity = query.severity;
    }
    if (query.departmentId) {
      where.departmentId = query.departmentId;
    }
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { tags: { has: query.search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.problem.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          department: {
            select: { id: true, name: true, code: true },
          },
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          _count: {
            select: { proposals: true, documents: true },
          },
        },
      }),
      this.prisma.problem.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(idOrSlug: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);

    const problem = await this.prisma.problem.findFirst({
      where: isUuid ? { id: idOrSlug } : { slug: idOrSlug },
      include: {
        department: {
          select: { id: true, name: true, code: true, location: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
        documents: true,
        _count: {
          select: { proposals: true },
        },
      },
    });

    if (!problem) {
      throw new NotFoundException(`Problem challenge '${idOrSlug}' not found.`);
    }

    return problem;
  }

  async update(id: string, dto: UpdateProblemDto, currentUser: any) {
    const problem = await this.findById(id);

    // Only ADMIN or the challenge author / member of the sponsoring department can update
    if (
      currentUser.role !== Role.ADMIN &&
      problem.createdById !== currentUser.id &&
      problem.departmentId !== currentUser.departmentId
    ) {
      throw new ForbiddenException('You do not have permission to modify this problem statement.');
    }

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description.trim();
    if (dto.category !== undefined) data.category = dto.category.trim();
    if (dto.severity !== undefined) data.severity = dto.severity;
    if (dto.budget !== undefined) data.budget = dto.budget;
    if (dto.deadline !== undefined) data.deadline = dto.deadline ? new Date(dto.deadline) : null;
    if (dto.eligibilityCriteria !== undefined) data.eligibilityCriteria = dto.eligibilityCriteria;
    if (dto.expectedOutcomes !== undefined) data.expectedOutcomes = dto.expectedOutcomes;
    if (dto.tags !== undefined) data.tags = dto.tags;

    const updated = await this.prisma.problem.update({
      where: { id: problem.id },
      data,
      include: {
        department: { select: { id: true, name: true, code: true } },
      },
    });

    return updated;
  }

  async transitionStatus(id: string, dto: ProblemStatusTransitionDto, currentUser: any) {
    const problem = await this.findById(id);

    // Validate state machine rule from DESIGN.md
    validateProblemTransition(problem.status, dto.status);

    const fromState = problem.status;
    const toState = dto.status;

    // Atomically transition status and write hash-chained audit log with row/advisory lock
    const { entity: updatedProblem, auditRecord } = await this.auditService.transitionState({
      entity: 'Problem',
      entityId: problem.id,
      fromState,
      toState,
      actorId: currentUser?.id || null,
      action: `PROBLEM_${toState}`,
      metadata: {
        code: problem.code,
        title: problem.title,
        reason: dto.reason || undefined,
        actorRole: currentUser?.role,
      },
      updateFn: async (tx) => {
        return tx.problem.update({
          where: { id: problem.id },
          data: { status: toState },
          include: {
            department: { select: { id: true, name: true, code: true } },
          },
        });
      },
    });

    return {
      message: `Problem status successfully transitioned from '${fromState}' to '${toState}'.`,
      problem: updatedProblem,
      auditRecordId: auditRecord.id,
    };
  }

  async remove(id: string, currentUser: any) {
    const problem = await this.findById(id);

    if (currentUser.role !== Role.ADMIN && problem.createdById !== currentUser.id) {
      throw new ForbiddenException('Only administrators or challenge creators may delete a problem.');
    }

    const proposalCount = await this.prisma.proposal.count({
      where: { problemId: problem.id },
    });

    if (proposalCount > 0) {
      throw new BadRequestException(
        `Cannot delete problem with ${proposalCount} existing proposal(s). Transition to 'CLOSED' status instead.`,
      );
    }

    await this.prisma.problem.delete({
      where: { id: problem.id },
    });

    await this.auditService.record({
      actorId: currentUser.id,
      action: 'PROBLEM_DELETED',
      entity: 'Problem',
      entityId: problem.id,
      payload: { code: problem.code, title: problem.title },
    });

    return { message: `Problem '${problem.title}' (${problem.code}) successfully removed.` };
  }
}
