import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { ProblemsModule } from './problems/problems.module';
import { ProposalsModule } from './proposals/proposals.module';
import { EvaluationsModule } from './evaluations/evaluations.module';
import { PilotsModule } from './pilots/pilots.module';
import { ProcurementsModule } from './procurements/procurements.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
    PrismaModule,
    AuthModule,
    AdminModule,
    AuditModule,
    ProblemsModule,
    ProposalsModule,
    EvaluationsModule,
    PilotsModule,
    ProcurementsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
