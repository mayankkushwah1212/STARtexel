import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [AdminUsersController],
})
export class AdminModule {}
