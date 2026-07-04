import { Injectable } from '@nestjs/common';
import { ENVIRONMENTS, type Environment } from '@growthos/shared';

export interface HealthStatus {
  status: 'ok';
  service: string;
  environment: Environment;
  environments: readonly Environment[];
}

@Injectable()
export class HealthService {
  getHealth(): HealthStatus {
    const configured = process.env.GROWTHOS_ENV;
    const environment: Environment =
      configured && (ENVIRONMENTS as readonly string[]).includes(configured)
        ? (configured as Environment)
        : 'dev';

    return {
      status: 'ok',
      service: '@growthos/api',
      environment,
      environments: ENVIRONMENTS,
    };
  }
}
