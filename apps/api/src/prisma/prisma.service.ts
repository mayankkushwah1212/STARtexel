import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super();

    // Enforce immutable contract for AuditLog (strictly append-only: no update or delete)
    this.$use(async (params, next) => {
      if (params.model === 'AuditLog') {
        const disallowedActions = ['update', 'updateMany', 'delete', 'deleteMany', 'upsert'];
        if (disallowedActions.includes(params.action)) {
          throw new Error(
            `[ImmutableAuditLog] Operation '${params.action}' is prohibited on the audit_logs table. Audit logs are append-only.`,
          );
        }
      }
      return next(params);
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
