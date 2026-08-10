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
    expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});
