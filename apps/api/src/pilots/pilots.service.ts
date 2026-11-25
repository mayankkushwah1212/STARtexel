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
import { CreatePilotDto } from './dto/create-pilot.dto';
import { UpdatePilotDto } from './dto/update-pilot.dto';
import { PilotStatusTransitionDto } from './dto/pilot-status-transition.dto';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { SubmitMilestoneDto } from './dto/submit-milestone.dto';
import { VerifyMilestoneDto } from './dto/verify-milestone.dto';
import { QueryPilotsDto } from './dto/query-pilots.dto';
import {
  validatePilotTransition,
  validateMilestoneTransition,
} from './pilots.state-machine';
import {
  DisbursementStatus,
  MilestoneStatus,
  PilotStatus,
  ProposalStatus,
  Role,
} from '@prisma/client';

@Injectable()
export class PilotsService {
  private readonly logger = new Logger(PilotsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreatePilotDto, currentUser: any) {
    // 1. RBAC: Only DEPT and ADMIN roles can initiate pilot projects
    if (currentUser.role !== Role.DEPT && currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Only department officers or administrators can initiate pilot trials.');
    }

    // 2. Validate proposal
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: dto.proposalId },
      include: {
        problem: { select: { id: true, departmentId: true, title: true } },
        startup: { select: { id: true, name: true } },
        pilot: { select: { id: true } },
      },
    });

    if (!proposal) {
      throw new NotFoundException(`Proposal with ID '${dto.proposalId}' not found.`);
    }

    // Only ACCEPTED proposals can graduate to a pilot trial
    if (proposal.status !== ProposalStatus.ACCEPTED) {
      throw new BadRequestException(
        `Cannot create a pilot project from a proposal in '${proposal.status}' status. Only proposals in 'ACCEPTED' status can graduate to a pilot.`,
      );
    }

    // Department officers can only create pilots for their department
    let departmentId = dto.departmentId;
    if (currentUser.role === Role.DEPT) {
      if (proposal.problem.departmentId !== currentUser.departmentId) {
        throw new ForbiddenException('You can only launch pilots for proposals submitted to your department.');
      }
      departmentId = currentUser.departmentId;
    } else if (!departmentId) {
      departmentId = proposal.problem.departmentId;
    }

    if (proposal.pilot) {
      throw new ConflictException(
        `A pilot project (ID: ${proposal.pilot.id}) is already registered for proposal '${proposal.title}'.`,
      );
    }

    // Generate pilot tracking code
    const year = new Date().getFullYear();
    const count = await this.prisma.pilot.count();
    const code = `PLT-${year}-${String(count + 1).padStart(3, '0')}`;

    const initialStatus = dto.status || PilotStatus.INITIATED;

    // Create pilot along with any initial milestones in a single transaction
    const pilot = await this.prisma.pilot.create({
      data: {
        code,
        title: dto.title.trim(),
        scope: dto.scope.trim(),
        status: initialStatus,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        allocatedBudget: dto.allocatedBudget,
        spentBudget: 0.0,
        kpiTargets: dto.kpiTargets || {},
        departmentId,
        startupId: proposal.startupId,
        problemId: proposal.problemId,
        proposalId: proposal.id,
        managerId: dto.managerId || currentUser.id,
        milestones: dto.milestones && dto.milestones.length > 0
          ? {
              create: dto.milestones.map((m) => ({
                title: m.title.trim(),
                description: m.description.trim(),
                orderIndex: m.orderIndex,
                dueDate: new Date(m.dueDate),
                verificationCriteria: m.verificationCriteria?.trim() || null,
                disbursementAmount: m.disbursementAmount ?? null,
                status: MilestoneStatus.PENDING,
                disbursementStatus:
                  m.disbursementAmount !== undefined && m.disbursementAmount > 0
                    ? DisbursementStatus.PENDING
                    : DisbursementStatus.NOT_APPLICABLE,
              })),
            }
          : undefined,
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
        startup: { select: { id: true, name: true } },
        problem: { select: { id: true, title: true, code: true } },
        proposal: { select: { id: true, title: true, code: true } },
        milestones: { orderBy: { orderIndex: 'asc' } },
      },
    });

    // Record creation event in hash-chained audit trail
    await this.auditService.record({
      actorId: currentUser.id,
      action: 'PILOT_INITIATED',
      entity: 'Pilot',
      entityId: pilot.id,
      payload: {
        code: pilot.code,
        title: pilot.title,
        departmentId: pilot.departmentId,
        startupId: pilot.startupId,
        proposalId: pilot.proposalId,
        allocatedBudget: Number(pilot.allocatedBudget),
        milestonesCount: pilot.milestones.length,
        status: pilot.status,
      },
    });

    return pilot;
  }

  async findAll(query: QueryPilotsDto, currentUser: any) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    // RBAC Scope Enforcement:
    // STARTUP users can ONLY see pilots assigned to their startup
    if (currentUser.role === Role.STARTUP) {
      where.startupId = currentUser.startupId || '00000000-0000-0000-0000-000000000000';
    } else if (currentUser.role === Role.DEPT) {
      // DEPT users see pilots for their department
      where.departmentId = currentUser.departmentId;
    }

    if (query.departmentId && currentUser.role !== Role.DEPT) {
      where.departmentId = query.departmentId;
    }
    if (query.startupId && currentUser.role !== Role.STARTUP) {
      where.startupId = query.startupId;
    }
    if (query.problemId) {
      where.problemId = query.problemId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
        { scope: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.pilot.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          department: { select: { id: true, name: true, code: true } },
          startup: { select: { id: true, name: true } },
          problem: { select: { id: true, title: true, code: true } },
          manager: { select: { id: true, firstName: true, lastName: true, email: true } },
          _count: { select: { milestones: true, procurements: true } },
        },
      }),
      this.prisma.pilot.count({ where }),
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
      throw new NotFoundException(`Pilot project with ID '${id}' not found.`);
    }

    const pilot = await this.prisma.pilot.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true, code: true } },
        startup: { select: { id: true, name: true, registrationNumber: true } },
        problem: { select: { id: true, title: true, code: true } },
        proposal: { select: { id: true, title: true, code: true } },
        manager: { select: { id: true, firstName: true, lastName: true, email: true } },
        milestones: { orderBy: { orderIndex: 'asc' } },
        procurements: true,
      },
    });

    if (!pilot) {
      throw new NotFoundException(`Pilot project with ID '${id}' not found.`);
    }

    // RBAC Isolation
    if (currentUser.role === Role.STARTUP && pilot.startupId !== currentUser.startupId) {
      throw new ForbiddenException('You are not authorized to view pilots belonging to other startups.');
    }
    if (currentUser.role === Role.DEPT && pilot.departmentId !== currentUser.departmentId) {
      throw new ForbiddenException('You are not authorized to view pilots belonging to other departments.');
    }

    return pilot;
  }

  async update(id: string, dto: UpdatePilotDto, currentUser: any) {
    const pilot = await this.findById(id, currentUser);

    if (currentUser.role !== Role.ADMIN && pilot.departmentId !== currentUser.departmentId) {
      throw new ForbiddenException('Only administrators or assigned department officers may update pilot details.');
    }

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.scope !== undefined) data.scope = dto.scope.trim();
    if (dto.endDate !== undefined) data.endDate = new Date(dto.endDate);
    if (dto.actualEndDate !== undefined) data.actualEndDate = new Date(dto.actualEndDate);
    if (dto.allocatedBudget !== undefined) data.allocatedBudget = dto.allocatedBudget;
    if (dto.spentBudget !== undefined) data.spentBudget = dto.spentBudget;
    if (dto.kpiTargets !== undefined) data.kpiTargets = dto.kpiTargets;
    if (dto.kpiResults !== undefined) data.kpiResults = dto.kpiResults;
    if (dto.managerId !== undefined) data.managerId = dto.managerId;

    const updated = await this.prisma.pilot.update({
      where: { id: pilot.id },
      data,
      include: {
        department: { select: { id: true, name: true } },
        startup: { select: { id: true, name: true } },
      },
    });

    return updated;
  }

  async transitionStatus(id: string, dto: PilotStatusTransitionDto, currentUser: any) {
    const pilot = await this.findById(id, currentUser);

    if (currentUser.role !== Role.ADMIN && pilot.departmentId !== currentUser.departmentId) {
      throw new ForbiddenException('Only administrators or sponsoring department officers may change pilot status.');
    }

    // 1. Validate state machine rule
    validatePilotTransition(pilot.status, dto.status);

    const fromState = pilot.status;
    const toState = dto.status;

    // 2. Atomically transition status and write hash-chained audit record
    const { entity: updatedPilot, auditRecord } = await this.auditService.transitionState({
      entity: 'Pilot',
      entityId: pilot.id,
      fromState,
      toState,
      actorId: currentUser?.id || null,
      action: `PILOT_${toState}`,
      metadata: {
        code: pilot.code,
        title: pilot.title,
        departmentId: pilot.departmentId,
        startupId: pilot.startupId,
        reason: dto.reason || undefined,
        kpiResults: dto.kpiResults || undefined,
        actorRole: currentUser?.role,
      },
      updateFn: async (tx) => {
        return tx.pilot.update({
          where: { id: pilot.id },
          data: {
            status: toState,
            actualEndDate:
              toState === PilotStatus.COMPLETED || toState === PilotStatus.GRADUATED
                ? new Date()
                : undefined,
            kpiResults: dto.kpiResults ? (dto.kpiResults as any) : undefined,
          },
          include: {
            department: { select: { id: true, name: true } },
            startup: { select: { id: true, name: true } },
          },
        });
      },
    });

    return {
      message: `Pilot status successfully transitioned from '${fromState}' to '${toState}'.`,
      pilot: updatedPilot,
      auditRecordId: auditRecord.id,
    };
  }

  // ============================================================================
  // MILESTONES LIFECYCLE & DISBURSEMENT
  // ============================================================================

  async addMilestone(pilotId: string, dto: CreateMilestoneDto, currentUser: any) {
    const pilot = await this.findById(pilotId, currentUser);

    if (currentUser.role !== Role.ADMIN && pilot.departmentId !== currentUser.departmentId) {
      throw new ForbiddenException('Only department officers or administrators can add milestones to a pilot.');
    }

    const milestone = await this.prisma.milestone.create({
      data: {
        pilotId: pilot.id,
        title: dto.title.trim(),
        description: dto.description.trim(),
        orderIndex: dto.orderIndex,
        dueDate: new Date(dto.dueDate),
        verificationCriteria: dto.verificationCriteria?.trim() || null,
        disbursementAmount: dto.disbursementAmount ?? null,
        status: MilestoneStatus.PENDING,
        disbursementStatus:
          dto.disbursementAmount !== undefined && dto.disbursementAmount > 0
            ? DisbursementStatus.PENDING
            : DisbursementStatus.NOT_APPLICABLE,
      },
    });

    await this.auditService.record({
      actorId: currentUser.id,
      action: 'MILESTONE_CREATED',
      entity: 'Milestone',
      entityId: milestone.id,
      payload: {
        pilotId: pilot.id,
        title: milestone.title,
        orderIndex: milestone.orderIndex,
        dueDate: milestone.dueDate,
        disbursementAmount: milestone.disbursementAmount ? Number(milestone.disbursementAmount) : null,
      },
    });

    return milestone;
  }

  async submitMilestone(
    pilotId: string,
    milestoneId: string,
    dto: SubmitMilestoneDto,
    currentUser: any,
  ) {
    const pilot = await this.findById(pilotId, currentUser);

    // Only the assigned startup vendor can submit deliverables for a milestone
    if (currentUser.role !== Role.ADMIN && pilot.startupId !== currentUser.startupId) {
      throw new ForbiddenException('Only the executing startup vendor can submit milestone deliverables.');
    }

    const milestone = await this.prisma.milestone.findUnique({
      where: { id: milestoneId },
    });

    if (!milestone || milestone.pilotId !== pilot.id) {
      throw new NotFoundException(`Milestone with ID '${milestoneId}' not found on this pilot.`);
    }

    // Validate milestone state machine
    validateMilestoneTransition(milestone.status, MilestoneStatus.SUBMITTED);

    const fromState = milestone.status;
    const toState = MilestoneStatus.SUBMITTED;

    // Atomically update milestone deliverable and log state transition
    const { entity: updatedMilestone, auditRecord } = await this.auditService.transitionState({
      entity: 'Milestone',
      entityId: milestone.id,
      fromState,
      toState,
      actorId: currentUser?.id || null,
      action: 'MILESTONE_SUBMITTED',
      metadata: {
        pilotId: pilot.id,
        pilotCode: pilot.code,
        title: milestone.title,
        orderIndex: milestone.orderIndex,
        comments: dto.comments || undefined,
        actorRole: currentUser?.role,
      },
      updateFn: async (tx) => {
        return tx.milestone.update({
          where: { id: milestone.id },
          data: {
            deliverables: dto.deliverables.trim(),
            status: toState,
          },
        });
      },
    });

    return {
      message: `Milestone '${milestone.title}' deliverables successfully submitted for review.`,
      milestone: updatedMilestone,
      auditRecordId: auditRecord.id,
    };
  }

  async verifyMilestone(
    pilotId: string,
    milestoneId: string,
    dto: VerifyMilestoneDto,
    currentUser: any,
  ) {
    const pilot = await this.findById(pilotId, currentUser);

    if (currentUser.role !== Role.ADMIN && pilot.departmentId !== currentUser.departmentId) {
      throw new ForbiddenException('Only department officers or administrators can verify milestones.');
    }

    const milestone = await this.prisma.milestone.findUnique({
      where: { id: milestoneId },
    });

    if (!milestone || milestone.pilotId !== pilot.id) {
      throw new NotFoundException(`Milestone with ID '${milestoneId}' not found on this pilot.`);
    }

    // Validate milestone state machine
    validateMilestoneTransition(milestone.status, dto.status);

    const fromState = milestone.status;
    const toState = dto.status;

    const isVerified = toState === MilestoneStatus.VERIFIED;
    const disbursementStatus =
      dto.disbursementStatus ||
      (isVerified && milestone.disbursementAmount ? DisbursementStatus.APPROVED : milestone.disbursementStatus);

    const shouldIncrementSpent =
      disbursementStatus === DisbursementStatus.DISBURSED &&
      milestone.disbursementStatus !== DisbursementStatus.DISBURSED &&
      milestone.disbursementAmount;

    // Execute verification and fund disbursement inside transaction with audit row lock
    const { entity: updatedMilestone, auditRecord } = await this.auditService.transitionState({
      entity: 'Milestone',
      entityId: milestone.id,
      fromState,
      toState,
      actorId: currentUser?.id || null,
      action: isVerified ? 'MILESTONE_VERIFIED' : 'MILESTONE_REJECTED',
      metadata: {
        pilotId: pilot.id,
        pilotCode: pilot.code,
        title: milestone.title,
        orderIndex: milestone.orderIndex,
        feedback: dto.verificationFeedback,
        disbursementStatus,
        actorRole: currentUser?.role,
      },
      updateFn: async (tx) => {
        const m = await tx.milestone.update({
          where: { id: milestone.id },
          data: {
            status: toState,
            verificationFeedback: dto.verificationFeedback.trim(),
            completedDate: isVerified ? new Date() : null,
            disbursementStatus,
          },
        });

        if (shouldIncrementSpent) {
          await tx.pilot.update({
            where: { id: pilot.id },
            data: {
              spentBudget: {
                increment: milestone.disbursementAmount!,
              },
            },
          });
        }

        return m;
      },
    });

    return {
      message: `Milestone '${milestone.title}' marked as '${toState}'.`,
      milestone: updatedMilestone,
      auditRecordId: auditRecord.id,
    };
  }
}
