import { Injectable } from '@nestjs/common';
import { APP_CONFIG, HealthStatus } from '@startexel/shared';

@Injectable()
export class AppService {
  getHello(): string {
    return `Hello from ${APP_CONFIG.name} API!`;
  }

  getHealth(): HealthStatus {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
