import { Injectable } from '@nestjs/common';
import { ENVIRONMENTS, type Environment } from '@growthos/shared';

export interface HealthStatus {
  status: 'ok';
  service: string;
  environment: Environment;
  environments: readonly Environment[];
}

export interface LivenessStatus {
  status: 'ok';
  uptimeSeconds: number;
}

export interface ReadinessStatus {
  status: 'ok';
}

function resolveEnvironment(): Environment {
  const configured = process.env.GROWTHOS_ENV;
  return configured && (ENVIRONMENTS as readonly string[]).includes(configured) ? (configured as Environment) : 'dev';
}

@Injectable()
export class HealthService {
  getHealth(): HealthStatus {
    return {
      status: 'ok',
      service: '@growthos/api',
      environment: resolveEnvironment(),
      environments: ENVIRONMENTS,
    };
  }

  getLiveness(): LivenessStatus {
    return {
      status: 'ok',
      uptimeSeconds: process.uptime(),
    };
  }

  getReadiness(): ReadinessStatus {
    return {
      status: 'ok',
    };
  }
}
