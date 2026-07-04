import { Controller, Get } from '@nestjs/common';
import { HealthService, type HealthStatus, type LivenessStatus, type ReadinessStatus } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth(): HealthStatus {
    return this.healthService.getHealth();
  }

  /** Liveness probe for uptime checks: process is up, no dependency checks. */
  @Get('live')
  getLiveness(): LivenessStatus {
    return this.healthService.getLiveness();
  }

  /** Readiness probe for uptime checks: process is up and ready to serve traffic. */
  @Get('ready')
  getReadiness(): ReadinessStatus {
    return this.healthService.getReadiness();
  }
}
