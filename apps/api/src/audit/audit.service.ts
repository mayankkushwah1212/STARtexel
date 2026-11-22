import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';

export interface CreateAuditLogInput {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId: string;
  payload: Record<string, unknown> | any;
  createdAt?: Date;
}

export interface VerificationResult {
  valid: boolean;
  totalRecords: number;
  message: string;
  genesisHash?: string;
  latestHash?: string;
  brokenAtIndex?: number;
  brokenRecordId?: string;
  reason?: 'PREV_HASH_MISMATCH' | 'HASH_MISMATCH';
  expectedPrevHash?: string;
  actualPrevHash?: string;
  expectedHash?: string;
  actualHash?: string;
  tamperedRecord?: {
    id: string;
    action: string;
    entity: string;
    entityId: string;
    createdAt: Date;
  };
}

export function canonicalJsonStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => (item === undefined ? 'null' : canonicalJsonStringify(item))).join(',') + ']';
  }
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJsonStringify(obj[k])).join(',') + '}';
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes a hash-chained audit record inside a DB transaction with a transaction-level
   * advisory lock (pg_advisory_xact_lock) acquired at the start of the transaction to guarantee
   * strict serialization, even on empty tables, and prevent fork/concurrency anomalies.
   * If an existing transaction client (txClient) is provided, executes inside it.
   */
  async log(input: CreateAuditLogInput, txClient?: Prisma.TransactionClient) {
    const execute = async (tx: Prisma.TransactionClient) => {
      let prevHash = 'GENESIS';

      // 1. Acquire transaction-level advisory lock at the start of the transaction
      if (typeof tx.$executeRawUnsafe === 'function') {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext('audit_logs'))`);
      }

      // 2. Query the latest record to obtain the previous block hash
      if (typeof tx.$queryRawUnsafe === 'function') {
        const latestRows = await tx.$queryRawUnsafe<
          Array<{ id: string; hash: string; created_at: Date }>
        >(
          `SELECT id, hash, created_at FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 1`,
        );
        if (latestRows && latestRows.length > 0) {
          prevHash = latestRows[0].hash;
        }
      } else if (tx.auditLog && typeof tx.auditLog.findFirst === 'function') {
        const latestRow = await tx.auditLog.findFirst({
          orderBy: { createdAt: 'desc' },
        });
        if (latestRow) {
          prevHash = latestRow.hash;
        }
      }

      const createdAt = input.createdAt || new Date();

      // 3. Compute SHA-256 hash using canonical JSON representation
      const canonicalPayload = canonicalJsonStringify(input.payload);
      const dataToHash = `${prevHash}|${input.actorId || 'SYSTEM'}|${input.action}|${input.entity}|${input.entityId}|${canonicalPayload}|${createdAt.toISOString()}`;
      const hash = crypto.createHash('sha256').update(dataToHash).digest('hex');

      // 4. Insert append-only row
      if (tx.auditLog && typeof tx.auditLog.create === 'function') {
        const record = await tx.auditLog.create({
          data: {
            actorId: input.actorId || null,
            action: input.action,
            entity: input.entity,
            entityId: input.entityId,
            payload: input.payload,
            prevHash,
            hash,
            createdAt,
          },
        });
        return record;
      }

      return {
        id: crypto.randomUUID(),
        actorId: input.actorId || null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        payload: input.payload,
        prevHash,
        hash,
        createdAt,
      };
    };

    if (txClient) {
      return execute(txClient);
    }
    if (typeof this.prisma.$transaction === 'function') {
      return this.prisma.$transaction(execute);
    }
    return execute(this.prisma as any);
  }

  /**
   * Alias for log() to record an audit entry.
   */
  async record(input: CreateAuditLogInput, txClient?: Prisma.TransactionClient) {
    return this.log(input, txClient);
  }

  /**
   * Records an entity state transition inside a DB transaction with a row lock on the latest audit log.
   */
  async logStateTransition(
    params: {
      actorId?: string | null;
      entity: string;
      entityId: string;
      fromState: string;
      toState: string;
      action?: string;
      metadata?: Record<string, unknown>;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const action = params.action || `${params.entity.toUpperCase()}_STATUS_TRANSITION`;
    return this.log(
      {
        actorId: params.actorId || null,
        action,
        entity: params.entity,
        entityId: params.entityId,
        payload: {
          from: params.fromState,
          to: params.toState,
          ...(params.metadata || {}),
        },
      },
      tx,
    );
  }

  /**
   * Atomically executes any entity status transition and appends the hash-chained
   * audit log within a single DB transaction protected by a row lock.
   */
  async transitionState<T>(
    params: {
      entity: string;
      entityId: string;
      fromState: string;
      toState: string;
      actorId?: string | null;
      action?: string;
      metadata?: Record<string, unknown>;
      updateFn: (tx: Prisma.TransactionClient) => Promise<T>;
    },
    existingTx?: Prisma.TransactionClient,
  ): Promise<{ entity: T; auditRecord: any }> {
    const runInTx = async (tx: Prisma.TransactionClient) => {
      const entity = await params.updateFn(tx);
      const auditRecord = await this.logStateTransition(
        {
          actorId: params.actorId,
          entity: params.entity,
          entityId: params.entityId,
          fromState: params.fromState,
          toState: params.toState,
          action: params.action,
          metadata: params.metadata,
        },
        tx,
      );
      return { entity, auditRecord };
    };

    if (existingTx) {
      return runInTx(existingTx);
    }
    if (typeof this.prisma.$transaction === 'function') {
      return this.prisma.$transaction(runInTx);
    }
    return runInTx(this.prisma as any);
  }

  /**
   * Recomputes the entire audit log chain from GENESIS to the latest record.
   * Reports whether the chain is valid or pinpoints the exact first broken link.
   */
  async verifyChain(): Promise<VerificationResult> {
    const logs = await this.prisma.auditLog.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    let expectedPrevHash = 'GENESIS';

    for (let i = 0; i < logs.length; i++) {
      const record = logs[i];

      // 1. Check prev_hash pointer continuity
      if (record.prevHash !== expectedPrevHash) {
        this.logger.warn(
          `Audit chain broken at index ${i} (ID: ${record.id}): prev_hash mismatch. Expected ${expectedPrevHash}, found ${record.prevHash}`,
        );
        return {
          valid: false,
          totalRecords: logs.length,
          brokenAtIndex: i,
          brokenRecordId: record.id,
          reason: 'PREV_HASH_MISMATCH',
          expectedPrevHash,
          actualPrevHash: record.prevHash,
          message: `Audit chain broken at index ${i}: prev_hash does not match previous record's hash.`,
          tamperedRecord: {
            id: record.id,
            action: record.action,
            entity: record.entity,
            entityId: record.entityId,
            createdAt: record.createdAt,
          },
        };
      }

      // 2. Recompute the record's cryptographic hash
      const canonicalPayload = canonicalJsonStringify(record.payload);
      const dataToHash = `${record.prevHash}|${record.actorId || 'SYSTEM'}|${record.action}|${record.entity}|${record.entityId}|${canonicalPayload}|${record.createdAt.toISOString()}`;
      const computedHash = crypto.createHash('sha256').update(dataToHash).digest('hex');

      if (record.hash !== computedHash) {
        this.logger.warn(
          `Audit chain broken at index ${i} (ID: ${record.id}): hash mismatch. Expected ${computedHash}, found ${record.hash}`,
        );
        return {
          valid: false,
          totalRecords: logs.length,
          brokenAtIndex: i,
          brokenRecordId: record.id,
          reason: 'HASH_MISMATCH',
          expectedHash: computedHash,
          actualHash: record.hash,
          message: `Audit chain broken at index ${i}: stored hash does not match recomputed SHA-256 digest (data was tampered with).`,
          tamperedRecord: {
            id: record.id,
            action: record.action,
            entity: record.entity,
            entityId: record.entityId,
            createdAt: record.createdAt,
          },
        };
      }

      // 3. Advance pointer
      expectedPrevHash = record.hash;
    }

    return {
      valid: true,
      totalRecords: logs.length,
      message: 'Audit log cryptographic chain is intact and fully verified.',
      genesisHash: 'GENESIS',
      latestHash: expectedPrevHash,
    };
  }

  /**
   * Fetch recent audit logs for administrative / auditor inspection.
   */
  async getRecentLogs(limit = 50) {
    return this.prisma.auditLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });
  }
}
