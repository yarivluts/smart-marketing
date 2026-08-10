import { Injectable } from '@nestjs/common';
import { ENVIRONMENTS, isEnvironment, type Environment } from '@growthos/shared';

export interface HealthStatus {
  status: 'ok';
  service: string;
  environment: Environment;
  environments: readonly Environment[];
  /** Seconds since this process started; a live-but-just-restarted process is
   * a signal worth surfacing to whatever polls this endpoint as an uptime check. */
  uptimeSeconds: number;
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
    };
  }
}
