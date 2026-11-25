import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateProcurementDto } from './dto/create-procurement.dto';
import { UpdateProcurementDto } from './dto/update-procurement.dto';
import { ProcurementStatusTransitionDto } from './dto/procurement-status-transition.dto';
import { QueryProcurementsDto } from './dto/query-procurements.dto';
import { validateProcurementTransition } from './procurements.state-machine';
import { PilotStatus, ProcurementStatus, Role } from '@prisma/client';

@Injectable()
export class ProcurementsService {
  private readonly logger = new Logger(ProcurementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateProcurementDto, currentUser: any) {
    // 1. RBAC: Only DEPT and ADMIN roles can issue public procurement contracts
    if (currentUser.role !== Role.DEPT && currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Only department procurement officers or administrators can create contracts.');
    }

    // 2. Validate pilot: Procurement contracts are created only from a COMPLETED pilot
    if (!dto.pilotId) {
      throw new BadRequestException('A valid pilotId is required. Procurement contracts must be created from a completed pilot project.');
    }

    const pilot = await this.prisma.pilot.findUnique({
      where: { id: dto.pilotId },
    });
    if (!pilot) {
      throw new NotFoundException(`Pilot project with ID '${dto.pilotId}' not found.`);
    }

    if (currentUser.role === Role.DEPT && pilot.departmentId !== currentUser.departmentId) {
      throw new ForbiddenException('Linked pilot does not belong to your department.');
    }

    if (pilot.status !== PilotStatus.COMPLETED && pilot.status !== PilotStatus.GRADUATED) {
      throw new BadRequestException(
        `Cannot create procurement contract from a pilot in '${pilot.status}' status. Procurement contracts can only be created from a 'COMPLETED' pilot project.`,
      );
    }

    const departmentId = currentUser.role === Role.DEPT ? currentUser.departmentId : (dto.departmentId || pilot.departmentId);
    const startupId = dto.startupId || pilot.startupId;

    // Verify department exists
    const dept = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!dept) {
      throw new NotFoundException(`Department with ID '${departmentId}' not found.`);
    }

    // Verify target startup exists
    const startup = await this.prisma.startup.findUnique({
      where: { id: startupId },
    });
    if (!startup) {
      throw new NotFoundException(`Startup vendor with ID '${startupId}' not found.`);
    }

    // Generate contract number
    const year = new Date().getFullYear();
    const count = await this.prisma.procurement.count();
    const contractNumber = `PROC-${year}-${String(count + 1).padStart(4, '0')}`;

    const initialStatus = dto.status || ProcurementStatus.DRAFT;

    const procurement = await this.prisma.procurement.create({
      data: {
        contractNumber,
        title: dto.title.trim(),
        description: dto.description.trim(),
        type: dto.type,
        status: initialStatus,
        pilotId: pilot.id,
        departmentId,
        startupId,
        contractValue: dto.contractValue,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        termsAndConditions: dto.termsAndConditions?.trim() || null,
        approvalOfficer: dto.approvalOfficer?.trim() || null,
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
        startup: { select: { id: true, name: true, registrationNumber: true } },
        pilot: { select: { id: true, code: true, title: true, status: true } },
      },
    });

    // Record contract creation in cryptographic audit trail
    await this.auditService.record({
      actorId: currentUser.id,
      action: initialStatus === ProcurementStatus.PENDING_APPROVAL ? 'CONTRACT_SUBMITTED' : 'CONTRACT_DRAFTED',
      entity: 'Procurement',
      entityId: procurement.id,
      payload: {
        contractNumber: procurement.contractNumber,
        title: procurement.title,
        departmentId: procurement.departmentId,
        startupId: procurement.startupId,
        pilotId: procurement.pilotId,
        contractValue: Number(procurement.contractValue),
        type: procurement.type,
        status: procurement.status,
      },
    });

    return procurement;
  }

  async findAll(query: QueryProcurementsDto, currentUser: any) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    // RBAC Scope Enforcement:
    // STARTUP users can ONLY ever see contracts awarded to their startup
    if (currentUser.role === Role.STARTUP) {
      where.startupId = currentUser.startupId || '00000000-0000-0000-0000-000000000000';
    } else if (currentUser.role === Role.DEPT) {
      where.departmentId = currentUser.departmentId;
    }

    if (query.departmentId && currentUser.role !== Role.DEPT) {
      where.departmentId = query.departmentId;
    }
    if (query.startupId && currentUser.role !== Role.STARTUP) {
      where.startupId = query.startupId;
    }
    if (query.pilotId) {
      where.pilotId = query.pilotId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.type) {
      where.type = query.type;
    }
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { contractNumber: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.procurement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          department: { select: { id: true, name: true, code: true } },
          startup: { select: { id: true, name: true, registrationNumber: true } },
          pilot: { select: { id: true, code: true, title: true } },
        },
      }),
      this.prisma.procurement.count({ where }),
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
      throw new NotFoundException(`Procurement contract with ID '${id}' not found.`);
    }

    const procurement = await this.prisma.procurement.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true, code: true, location: true } },
        startup: { select: { id: true, name: true, registrationNumber: true, stage: true, website: true } },
        pilot: { select: { id: true, code: true, title: true, status: true } },
        documents: true,
      },
    });

    if (!procurement) {
      throw new NotFoundException(`Procurement contract with ID '${id}' not found.`);
    }

    // RBAC Isolation
    if (currentUser.role === Role.STARTUP && procurement.startupId !== currentUser.startupId) {
      throw new ForbiddenException('You are not authorized to view procurement contracts awarded to other startups.');
    }
    if (currentUser.role === Role.DEPT && procurement.departmentId !== currentUser.departmentId) {
      throw new ForbiddenException('You are not authorized to view procurement contracts for other departments.');
    }

    return procurement;
  }

  async update(id: string, dto: UpdateProcurementDto, currentUser: any) {
    const procurement = await this.findById(id, currentUser);

    if (currentUser.role !== Role.ADMIN && procurement.departmentId !== currentUser.departmentId) {
      throw new ForbiddenException('Only administrators or assigned department officers may modify contracts.');
    }

    if (
      procurement.status !== ProcurementStatus.DRAFT &&
      procurement.status !== ProcurementStatus.PENDING_APPROVAL
    ) {
      throw new BadRequestException(
        `Cannot edit contract in '${procurement.status}' status. Only DRAFT or PENDING_APPROVAL contracts can be modified.`,
      );
    }

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description.trim();
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.contractValue !== undefined) data.contractValue = dto.contractValue;
    if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) data.endDate = new Date(dto.endDate);
    if (dto.termsAndConditions !== undefined) data.termsAndConditions = dto.termsAndConditions.trim();
    if (dto.approvalOfficer !== undefined) data.approvalOfficer = dto.approvalOfficer.trim();

    const updated = await this.prisma.procurement.update({
      where: { id: procurement.id },
      data,
      include: {
        department: { select: { id: true, name: true } },
        startup: { select: { id: true, name: true } },
      },
    });

    return updated;
  }

  async transitionStatus(id: string, dto: ProcurementStatusTransitionDto, currentUser: any) {
    const procurement = await this.findById(id, currentUser);

    // 1. Validate state machine rule
    validateProcurementTransition(procurement.status, dto.status);

    // 2. Validate role-specific transitions
    if (dto.status === ProcurementStatus.CONTRACT_SIGNED) {
      // Both government authority and the awarded startup may sign
      if (
        currentUser.role === Role.STARTUP &&
        procurement.startupId !== currentUser.startupId
      ) {
        throw new ForbiddenException('Only the awarded startup can execute vendor contract signature.');
      }
      if (
        currentUser.role === Role.DEPT &&
        procurement.departmentId !== currentUser.departmentId
      ) {
        throw new ForbiddenException('Only the procuring department can execute departmental contract signature.');
      }
    } else {
      // PENDING_APPROVAL, APPROVED, FULFILLED, TERMINATED are government decisions
      if (currentUser.role !== Role.ADMIN && procurement.departmentId !== currentUser.departmentId) {
        throw new ForbiddenException('Only department officers or administrators can authorize contract state transitions.');
      }
    }

    const fromState = procurement.status;
    const toState = dto.status;

    // 3. Atomically transition status and write hash-chained audit record
    const { entity: updatedProcurement, auditRecord } = await this.auditService.transitionState({
      entity: 'Procurement',
      entityId: procurement.id,
      fromState,
      toState,
      actorId: currentUser?.id || null,
      action: `CONTRACT_${toState}`,
      metadata: {
        contractNumber: procurement.contractNumber,
        title: procurement.title,
        departmentId: procurement.departmentId,
        startupId: procurement.startupId,
        contractValue: Number(procurement.contractValue),
        approvalOfficer: dto.approvalOfficer || procurement.approvalOfficer || undefined,
        reason: dto.reason || undefined,
        actorRole: currentUser?.role,
      },
      updateFn: async (tx) => {
        return tx.procurement.update({
          where: { id: procurement.id },
          data: {
            status: toState,
            approvalOfficer: dto.approvalOfficer ? dto.approvalOfficer.trim() : undefined,
          },
          include: {
            department: { select: { id: true, name: true } },
            startup: { select: { id: true, name: true } },
          },
        });
      },
    });

    return {
      message: `Contract status successfully transitioned from '${fromState}' to '${toState}'.`,
      procurement: updatedProcurement,
      auditRecordId: auditRecord.id,
    };
  }
}
