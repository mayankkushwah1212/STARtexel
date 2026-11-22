import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { UpdateProposalDto } from './dto/update-proposal.dto';
import { ProposalStatusTransitionDto } from './dto/proposal-status-transition.dto';
import { QueryProposalsDto } from './dto/query-proposals.dto';
import { validateProposalTransition } from './proposals.state-machine';
import { ProblemStatus, ProposalStatus, Role, UserStatus } from '@prisma/client';

@Injectable()
export class ProposalsService {
  private readonly logger = new Logger(ProposalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateProposalDto, currentUser: any) {
    // 1. RBAC: Only ACTIVE STARTUP users (or ADMIN) can submit proposals
    if (currentUser.role !== Role.STARTUP && currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Only registered STARTUP accounts may submit proposals.');
    }

    if (currentUser.status !== UserStatus.ACTIVE && currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Only ACTIVE startup accounts can submit proposals.');
    }

    let startupId = dto.startupId;
    if (currentUser.role === Role.STARTUP) {
      if (!currentUser.startupId) {
        throw new BadRequestException('Your account is not associated with a registered startup.');
      }
      startupId = currentUser.startupId;
    } else if (!startupId) {
      throw new BadRequestException('A target startupId is required.');
    }

    // Verify startup exists
    const startup = await this.prisma.startup.findUnique({
      where: { id: startupId },
    });
    if (!startup) {
      throw new NotFoundException(`Startup with ID ${startupId} not found.`);
    }

    // 2. Validate target problem exists and is open for proposals
    const problem = await this.prisma.problem.findUnique({
      where: { id: dto.problemId },
    });
    if (!problem) {
      throw new NotFoundException(`Problem challenge with ID ${dto.problemId} not found.`);
    }

    if (
      problem.status === ProblemStatus.DRAFT ||
      problem.status === ProblemStatus.RESOLVED ||
      problem.status === ProblemStatus.CLOSED
    ) {
      throw new BadRequestException(
        `Problem '${problem.title}' is currently '${problem.status}' and is not accepting proposals.`,
      );
    }

    // Check if deadline has passed
    if (problem.deadline && new Date() > new Date(problem.deadline)) {
      throw new BadRequestException('The proposal submission deadline for this challenge has passed.');
    }

    // 3. Generate proposal code
    const year = new Date().getFullYear();
    const count = await this.prisma.proposal.count();
    const code = `PROP-${year}-${String(count + 1).padStart(3, '0')}`;

    const proposal = await this.prisma.proposal.create({
      data: {
        code,
        title: dto.title.trim(),
        summary: dto.summary.trim(),
        technicalApproach: dto.technicalApproach.trim(),
        budget: dto.budget,
        durationMonths: dto.durationMonths,
        status: dto.status || ProposalStatus.SUBMITTED,
        problemId: problem.id,
        startupId,
        submittedById: currentUser.id,
      },
      include: {
        startup: {
          select: { id: true, name: true, registrationNumber: true },
        },
        problem: {
          select: { id: true, title: true, code: true, departmentId: true },
        },
        submittedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    // 4. Record submission in audit trail
    await this.auditService.record({
      actorId: currentUser.id,
      action: 'PROPOSAL_SUBMITTED',
      entity: 'Proposal',
      entityId: proposal.id,
      payload: {
        code: proposal.code,
        title: proposal.title,
        problemId: proposal.problemId,
        startupId: proposal.startupId,
        budget: Number(proposal.budget),
        durationMonths: proposal.durationMonths,
        status: proposal.status,
      },
    });

    return proposal;
  }

  async findAll(query: QueryProposalsDto, currentUser: any) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    // RBAC Scope Enforcement:
    // STARTUP users can ONLY ever see their own startup's proposals
    if (currentUser.role === Role.STARTUP) {
      where.startupId = currentUser.startupId || '00000000-0000-0000-0000-000000000000';
    } else if (currentUser.role === Role.DEPT) {
      // DEPT users only see proposals submitted to problems issued by their department
      if (query.problemId) {
        where.problemId = query.problemId;
        where.problem = { departmentId: currentUser.departmentId };
      } else {
        where.problem = { departmentId: currentUser.departmentId };
      }
    } else {
      // ADMIN, AUDITOR, EVALUATOR
      if (query.problemId) {
        where.problemId = query.problemId;
      }
      if (query.startupId) {
        where.startupId = query.startupId;
      }
    }

    if (query.status) {
      where.status = query.status;
    }

    const [items, total] = await Promise.all([
      this.prisma.proposal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          startup: {
            select: { id: true, name: true, registrationNumber: true },
          },
          problem: {
            select: { id: true, title: true, code: true, departmentId: true },
          },
          submittedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          _count: {
            select: { evaluations: true, documents: true },
          },
        },
      }),
      this.prisma.proposal.count({ where }),
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
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      throw new NotFoundException(`Proposal with ID '${id}' not found.`);
    }

    const proposal = await this.prisma.proposal.findUnique({
      where: { id },
      include: {
        startup: {
          select: { id: true, name: true, registrationNumber: true, stage: true, website: true },
        },
        problem: {
          select: { id: true, title: true, code: true, departmentId: true, status: true },
        },
        submittedBy: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
        evaluations: true,
        documents: true,
      },
    });

    if (!proposal) {
      throw new NotFoundException(`Proposal with ID '${id}' not found.`);
    }

    // RBAC: Startup can only see its own proposals
    if (currentUser.role === Role.STARTUP && proposal.startupId !== currentUser.startupId) {
      throw new ForbiddenException('You are not authorized to view proposals from other startups.');
    }

    // RBAC: DEPT can only see proposals submitted to problems in their department
    if (currentUser.role === Role.DEPT && proposal.problem.departmentId !== currentUser.departmentId) {
      throw new ForbiddenException('You are not authorized to view proposals for other departments.');
    }

    return proposal;
  }

  async update(id: string, dto: UpdateProposalDto, currentUser: any) {
    const proposal = await this.findById(id, currentUser);

    // Only owning STARTUP or ADMIN can edit
    if (currentUser.role === Role.STARTUP) {
      if (proposal.startupId !== currentUser.startupId) {
        throw new ForbiddenException('You can only update your own startup proposals.');
      }
      if (
        proposal.status !== ProposalStatus.DRAFT &&
        proposal.status !== ProposalStatus.SUBMITTED
      ) {
        throw new BadRequestException(
          `Cannot modify proposal in '${proposal.status}' status. Only DRAFT or SUBMITTED proposals can be updated.`,
        );
      }
    } else if (currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Only the submitting startup or an administrator can update proposals.');
    }

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.summary !== undefined) data.summary = dto.summary.trim();
    if (dto.technicalApproach !== undefined) data.technicalApproach = dto.technicalApproach.trim();
    if (dto.budget !== undefined) data.budget = dto.budget;
    if (dto.durationMonths !== undefined) data.durationMonths = dto.durationMonths;

    const updated = await this.prisma.proposal.update({
      where: { id: proposal.id },
      data,
      include: {
        startup: { select: { id: true, name: true } },
        problem: { select: { id: true, title: true, code: true } },
      },
    });

    return updated;
  }

  async transitionStatus(id: string, dto: ProposalStatusTransitionDto, currentUser: any) {
    const proposal = await this.findById(id, currentUser);

    // 1. Validate state machine rule from DESIGN.md
    validateProposalTransition(proposal.status, dto.status);

    // 2. Validate role-specific state machine permissions
    if (currentUser.role === Role.STARTUP) {
      // Startups can only withdraw their proposal or submit draft
      if (
        dto.status !== ProposalStatus.WITHDRAWN &&
        !(proposal.status === ProposalStatus.DRAFT && dto.status === ProposalStatus.SUBMITTED)
      ) {
        throw new ForbiddenException(
          `Startups can only submit drafts or withdraw proposals. Transition to '${dto.status}' is restricted to evaluation staff.`,
        );
      }
    } else if (currentUser.role === Role.DEPT) {
      if (proposal.problem.departmentId !== currentUser.departmentId) {
        throw new ForbiddenException('Department staff can only review proposals submitted to their department problems.');
      }
      if (dto.status === ProposalStatus.WITHDRAWN) {
        throw new ForbiddenException('Only the submitting startup can withdraw their proposal.');
      }
    }

    const fromState = proposal.status;
    const toState = dto.status;

    // 3. Atomically transition status and record hash-chained audit log with row/advisory lock
    const { entity: updatedProposal, auditRecord } = await this.auditService.transitionState({
      entity: 'Proposal',
      entityId: proposal.id,
      fromState,
      toState,
      actorId: currentUser?.id || null,
      action: `PROPOSAL_${toState}`,
      metadata: {
        code: proposal.code,
        title: proposal.title,
        problemId: proposal.problemId,
        startupId: proposal.startupId,
        reason: dto.reason || undefined,
        actorRole: currentUser?.role,
      },
      updateFn: async (tx) => {
        return tx.proposal.update({
          where: { id: proposal.id },
          data: { status: toState },
          include: {
            startup: { select: { id: true, name: true } },
            problem: { select: { id: true, title: true, code: true } },
          },
        });
      },
    });

    return {
      message: `Proposal status successfully transitioned from '${fromState}' to '${toState}'.`,
      proposal: updatedProposal,
      auditRecordId: auditRecord.id,
    };
  }

  async remove(id: string, currentUser: any) {
    const proposal = await this.findById(id, currentUser);

    if (currentUser.role === Role.STARTUP) {
      if (proposal.status !== ProposalStatus.DRAFT) {
        throw new BadRequestException(
          `Cannot delete proposal in '${proposal.status}' status. Use status transition to 'WITHDRAWN' instead.`,
        );
      }
    } else if (currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Only the submitting startup (for drafts) or an administrator can delete a proposal.');
    }

    await this.prisma.proposal.delete({
      where: { id: proposal.id },
    });

    await this.auditService.record({
      actorId: currentUser.id,
      action: 'PROPOSAL_DELETED',
      entity: 'Proposal',
      entityId: proposal.id,
      payload: { code: proposal.code, title: proposal.title },
    });

    return { message: `Proposal '${proposal.title}' (${proposal.code}) successfully removed.` };
  }
}
