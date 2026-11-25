import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { UpdateEvaluationDto } from './dto/update-evaluation.dto';
import { EvaluationStatusTransitionDto } from './dto/evaluation-status-transition.dto';
import { QueryEvaluationsDto } from './dto/query-evaluations.dto';
import { validateEvaluationTransition } from './evaluations.state-machine';
import { EvaluationStatus, ProposalStatus, Role } from '@prisma/client';

@Injectable()
export class EvaluationsService {
  private readonly logger = new Logger(EvaluationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateEvaluationDto, currentUser: any) {
    // 1. RBAC: Only EVALUATOR users score proposals that are UNDER_REVIEW
    if (currentUser.role !== Role.EVALUATOR) {
      throw new ForbiddenException('Only assigned EVALUATOR accounts may score proposals.');
    }

    // 2. Validate target proposal is in UNDER_REVIEW status
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: dto.proposalId },
      include: {
        problem: { select: { id: true, departmentId: true, title: true } },
      },
    });

    if (!proposal) {
      throw new NotFoundException(`Proposal with ID '${dto.proposalId}' not found.`);
    }

    if (proposal.status !== ProposalStatus.UNDER_REVIEW) {
      throw new BadRequestException(
        `Cannot evaluate proposal in '${proposal.status}' status. Only proposals in 'UNDER_REVIEW' status can be scored.`,
      );
    }

    // 3. Prevent duplicate evaluation by the same evaluator
    const existing = await this.prisma.evaluation.findUnique({
      where: {
        proposalId_evaluatorId: {
          proposalId: dto.proposalId,
          evaluatorId: currentUser.id,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        'You have already submitted an evaluation for this proposal. Update your existing evaluation instead.',
      );
    }

    // 4. Calculate composite score if not explicitly passed
    const overallScore =
      dto.overallScore !== undefined
        ? dto.overallScore
        : Number(
            (
              dto.technicalScore * 0.3 +
              dto.feasibilityScore * 0.25 +
              dto.costScore * 0.2 +
              dto.impactScore * 0.25
            ).toFixed(2),
          );

    const initialStatus = dto.status || EvaluationStatus.SUBMITTED;
    const submittedAt = initialStatus === EvaluationStatus.SUBMITTED ? new Date() : null;

    const evaluation = await this.prisma.evaluation.create({
      data: {
        proposalId: dto.proposalId,
        evaluatorId: currentUser.id,
        technicalScore: dto.technicalScore,
        feasibilityScore: dto.feasibilityScore,
        costScore: dto.costScore,
        impactScore: dto.impactScore,
        overallScore,
        recommendation: dto.recommendation,
        comments: dto.comments.trim(),
        criteriaFeedback: dto.criteriaFeedback || {},
        status: initialStatus,
        submittedAt,
      },
      include: {
        proposal: {
          select: { id: true, code: true, title: true, startupId: true },
        },
        evaluator: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    // 5. Append immutable hash-chained audit log
    await this.auditService.record({
      actorId: currentUser.id,
      action: initialStatus === EvaluationStatus.FINALIZED ? 'EVALUATION_FINALIZED' : 'EVALUATION_SUBMITTED',
      entity: 'Evaluation',
      entityId: evaluation.id,
      payload: {
        proposalId: evaluation.proposalId,
        evaluatorId: evaluation.evaluatorId,
        overallScore: evaluation.overallScore,
        recommendation: evaluation.recommendation,
        criteriaFeedback: evaluation.criteriaFeedback,
        status: evaluation.status,
      },
    });

    return evaluation;
  }

  async findAll(query: QueryEvaluationsDto, currentUser: any) {
    // Startups cannot inspect evaluation scores
    if (currentUser.role === Role.STARTUP) {
      throw new ForbiddenException('Startups are not authorized to view internal evaluation rubrics and scores.');
    }

    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    // RBAC Scoping
    if (currentUser.role === Role.EVALUATOR) {
      // Evaluators only see their own evaluations
      where.evaluatorId = currentUser.id;
    } else if (currentUser.role === Role.DEPT) {
      // Department officers only see evaluations for their department's challenges
      where.proposal = {
        problem: { departmentId: currentUser.departmentId },
      };
    }

    if (query.proposalId) {
      where.proposalId = query.proposalId;
    }
    if (query.evaluatorId && currentUser.role !== Role.EVALUATOR) {
      where.evaluatorId = query.evaluatorId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.recommendation) {
      where.recommendation = query.recommendation;
    }

    const [items, total] = await Promise.all([
      this.prisma.evaluation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          proposal: {
            select: { id: true, code: true, title: true, status: true },
          },
          evaluator: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.prisma.evaluation.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string, currentUser: any) {
    if (currentUser.role === Role.STARTUP) {
      throw new ForbiddenException('Startups are not authorized to view evaluation scores.');
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      throw new NotFoundException(`Evaluation with ID '${id}' not found.`);
    }

    const evaluation = await this.prisma.evaluation.findUnique({
      where: { id },
      include: {
        proposal: {
          select: {
            id: true,
            code: true,
            title: true,
            status: true,
            startupId: true,
            problem: { select: { id: true, departmentId: true, title: true } },
          },
        },
        evaluator: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!evaluation) {
      throw new NotFoundException(`Evaluation with ID '${id}' not found.`);
    }

    // Role checks
    if (currentUser.role === Role.EVALUATOR && evaluation.evaluatorId !== currentUser.id) {
      throw new ForbiddenException('You can only view your own evaluations.');
    }

    if (
      currentUser.role === Role.DEPT &&
      evaluation.proposal.problem.departmentId !== currentUser.departmentId
    ) {
      throw new ForbiddenException('You can only view evaluations for your department challenges.');
    }

    return evaluation;
  }

  async update(id: string, dto: UpdateEvaluationDto, currentUser: any) {
    const evaluation = await this.findById(id, currentUser);

    if (currentUser.role !== Role.ADMIN && evaluation.evaluatorId !== currentUser.id) {
      throw new ForbiddenException('Only the assigned evaluator or an administrator can edit this evaluation.');
    }

    if (evaluation.status === EvaluationStatus.FINALIZED) {
      throw new BadRequestException('Cannot edit an evaluation that has already been FINALIZED.');
    }

    const data: any = {};
    if (dto.technicalScore !== undefined) data.technicalScore = dto.technicalScore;
    if (dto.feasibilityScore !== undefined) data.feasibilityScore = dto.feasibilityScore;
    if (dto.costScore !== undefined) data.costScore = dto.costScore;
    if (dto.impactScore !== undefined) data.impactScore = dto.impactScore;
    if (dto.overallScore !== undefined) {
      data.overallScore = dto.overallScore;
    } else if (
      dto.technicalScore !== undefined ||
      dto.feasibilityScore !== undefined ||
      dto.costScore !== undefined ||
      dto.impactScore !== undefined
    ) {
      const tech = dto.technicalScore ?? evaluation.technicalScore;
      const feas = dto.feasibilityScore ?? evaluation.feasibilityScore;
      const cost = dto.costScore ?? evaluation.costScore;
      const imp = dto.impactScore ?? evaluation.impactScore;
      data.overallScore = Number((tech * 0.3 + feas * 0.25 + cost * 0.2 + imp * 0.25).toFixed(2));
    }

    if (dto.recommendation !== undefined) data.recommendation = dto.recommendation;
    if (dto.comments !== undefined) data.comments = dto.comments.trim();
    if (dto.criteriaFeedback !== undefined) data.criteriaFeedback = dto.criteriaFeedback;

    const updated = await this.prisma.evaluation.update({
      where: { id: evaluation.id },
      data,
      include: {
        proposal: { select: { id: true, code: true, title: true } },
        evaluator: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return updated;
  }

  async transitionStatus(id: string, dto: EvaluationStatusTransitionDto, currentUser: any) {
    const evaluation = await this.findById(id, currentUser);

    if (currentUser.role !== Role.ADMIN && evaluation.evaluatorId !== currentUser.id) {
      throw new ForbiddenException('Only the evaluator or an administrator can transition evaluation status.');
    }

    // 1. Validate state machine rule
    validateEvaluationTransition(evaluation.status, dto.status);

    const fromState = evaluation.status;
    const toState = dto.status;

    // 2. Atomically transition status and record hash-chained audit log with row lock
    const { entity: updatedEvaluation, auditRecord } = await this.auditService.transitionState({
      entity: 'Evaluation',
      entityId: evaluation.id,
      fromState,
      toState,
      actorId: currentUser?.id || null,
      action: `EVALUATION_${toState}`,
      metadata: {
        proposalId: evaluation.proposalId,
        evaluatorId: evaluation.evaluatorId,
        overallScore: evaluation.overallScore,
        recommendation: evaluation.recommendation,
        reason: dto.reason || undefined,
        actorRole: currentUser?.role,
      },
      updateFn: async (tx) => {
        return tx.evaluation.update({
          where: { id: evaluation.id },
          data: {
            status: toState,
            submittedAt: toState === EvaluationStatus.FINALIZED && !evaluation.submittedAt ? new Date() : undefined,
          },
          include: {
            proposal: { select: { id: true, code: true, title: true } },
          },
        });
      },
    });

    return {
      message: `Evaluation status successfully transitioned from '${fromState}' to '${toState}'.`,
      evaluation: updatedEvaluation,
      auditRecordId: auditRecord.id,
    };
  }
}
