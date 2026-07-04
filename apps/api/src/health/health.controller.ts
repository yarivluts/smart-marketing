import { Controller, Get } from '@nestjs/common';
import { HealthService, type HealthStatus } from './health.service';
import { Public } from '../authz/public.decorator';

@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth(): HealthStatus {
    return this.healthService.getHealth();
  }
}
