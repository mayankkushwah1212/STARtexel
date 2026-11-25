import { Module } from '@nestjs/common';
import { PilotsController } from './pilots.controller';
import { PilotsService } from './pilots.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [PilotsController],
  providers: [PilotsService],
  exports: [PilotsService],
})
export class PilotsModule {}
