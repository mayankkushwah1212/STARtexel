import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('test')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RbacTestController {
  @Get('admin')
  @Roles(Role.ADMIN)
  getAdminResource(@CurrentUser() user: any) {
    return {
      message: 'Access granted: ADMIN portal.',
      user,
    };
  }

  @Get('dept')
  @Roles(Role.DEPT)
  getDeptResource(@CurrentUser() user: any) {
    return {
      message: 'Access granted: DEPT departmental dashboard.',
      user,
    };
  }

  @Get('startup')
  @Roles(Role.STARTUP)
  getStartupResource(@CurrentUser() user: any) {
    return {
      message: 'Access granted: STARTUP portal.',
      user,
    };
  }

  @Get('evaluator')
  @Roles(Role.EVALUATOR)
  getEvaluatorResource(@CurrentUser() user: any) {
    return {
      message: 'Access granted: EVALUATOR scorecard suite.',
      user,
    };
  }

  @Get('auditor')
  @Roles(Role.AUDITOR)
  getAuditorResource(@CurrentUser() user: any) {
    return {
      message: 'Access granted: AUDITOR compliance audit viewer.',
      user,
    };
  }
}
