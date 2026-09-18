import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService, readBuildSha } from './health.service';

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
});

describe('readBuildSha', () => {
  it.each([
    ['62d2115', '62d2115'],
    ['  62D2115  ', '62d2115'],
    ['62d2115a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e', '62d2115a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e'],
  ])('accepts a git hash %s', (raw, expected) => {
    expect(readBuildSha(raw)).toBe(expected);
  });

  /**
   * A mis-set build arg must read as "not stamped", not as a commit that does
   * not exist — an unsubstituted `$SHORT_SHA` or an empty string would otherwise
   * be reported as though production were at that "commit".
   */
  it.each([[''], ['   '], ['$SHORT_SHA'], ['${_GIT_SHA}'], ['unknown'], ['abc'], [undefined]])(
    'treats %s as unstamped rather than as a commit',
    (raw) => {
      expect(readBuildSha(raw as string | undefined)).toBeNull();
    },
  );
});
