import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { HealthStatus } from '@startexel/shared';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth(): HealthStatus {
    return this.appService.getHealth();
  }
}
