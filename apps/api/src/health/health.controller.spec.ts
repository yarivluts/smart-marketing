import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { DBT_BUILD_INFO_EXECUTOR, DbtRefreshBuildService } from './dbt-refresh-build.service';
import { NotConfiguredWarehouseQueryExecutor } from '@growthos/firebase-orm-models';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        DbtRefreshBuildService,
        { provide: DBT_BUILD_INFO_EXECUTOR, useValue: new NotConfiguredWarehouseQueryExecutor() },
      ],
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

/**
 * `buildSha` is what lets production be compared against main from outside,
 * with no credentials (KAN-180). Twice in one week a merged, green fix sat
 * undeployed while an integrator waited, because nothing noticed the drift.
 */
describe('HealthController buildSha', () => {
  const original = process.env.GIT_SHA;
  afterEach(() => {
    if (original === undefined) delete process.env.GIT_SHA;
    else process.env.GIT_SHA = original;
  });

  it('reports the commit the image was built from', () => {
    process.env.GIT_SHA = '62d2115';
    expect(new HealthService().getHealth().buildSha).toBe('62d2115');
  });

  /**
   * `null`, never a sentinel like "unknown": the drift check has to tell "this
   * image predates stamping" from "this image is at commit X", and a string that
   * reads like a value is exactly what gets compared as though it were one.
   */
  it('reports null when the image was not stamped', () => {
    delete process.env.GIT_SHA;
    expect(new HealthService().getHealth().buildSha).toBeNull();
  });

  /** Validated by the shared `readBuildSha` (packages/shared), the same rule the web app and the dbt report use. */
  it('reports an unsubstituted build arg as unstamped', () => {
    process.env.GIT_SHA = '${_GIT_SHA}';
    expect(new HealthService().getHealth().buildSha).toBeNull();
  });
});
