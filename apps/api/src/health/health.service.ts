import { Injectable } from '@nestjs/common';
import { ENVIRONMENTS, isEnvironment, type Environment } from '@growthos/shared';

export interface HealthStatus {
  status: 'ok';
  service: string;
  environment: Environment;
  environments: readonly Environment[];
  /** Seconds the process has been running; lets uptime monitors detect restarts/crash loops. */
  uptimeSeconds: number;
  timestamp: string;
}

@Injectable()
export class HealthService {
  getHealth(): HealthStatus {
    const configured = process.env.GROWTHOS_ENV;
    const environment: Environment = configured && isEnvironment(configured) ? configured : 'dev';

    return {
      status: 'ok',
      service: '@growthos/api',
      environment,
      environments: ENVIRONMENTS,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
