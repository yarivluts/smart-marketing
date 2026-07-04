import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('reports an ok status for the api service', () => {
    const health = controller.getHealth();
    expect(health.status).toBe('ok');
    expect(health.service).toBe('@growthos/api');
    expect(health.environments).toContain('prod');
  });

  it('reports liveness with a non-negative uptime for uptime checks', () => {
    const liveness = controller.getLiveness();
    expect(liveness.status).toBe('ok');
    expect(liveness.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('reports readiness for uptime checks', () => {
    expect(controller.getReadiness()).toEqual({ status: 'ok' });
  });
});
