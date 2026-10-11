import { afterEach, describe, expect, it } from 'vitest';
import { dynamic, GET } from './route';

/**
 * The web app's build identity, read hourly and credential-free by
 * .github/workflows/prod-drift.yml (KAN-204). web-prod was not watched before this.
 */
describe('GET /api/health', () => {
  const original = process.env.GIT_SHA;
  afterEach(() => {
    if (original === undefined) delete process.env.GIT_SHA;
    else process.env.GIT_SHA = original;
  });

  it('reports the commit the image was built from', async () => {
    process.env.GIT_SHA = '62D2115';
    const response = GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', service: '@growthos/web', buildSha: '62d2115' });
  });

  it('reports null, never a sentinel, when the image was not stamped', async () => {
    delete process.env.GIT_SHA;
    expect((await GET().json()).buildSha).toBeNull();
  });

  it('reports an unsubstituted build arg as unstamped rather than as a commit', async () => {
    process.env.GIT_SHA = '${_GIT_SHA}';
    expect((await GET().json()).buildSha).toBeNull();
  });

  /** A cached health response can report a build that is no longer running. */
  it('is never cached', () => {
    expect(GET().headers.get('cache-control')).toBe('no-store');
    expect(dynamic).toBe('force-dynamic');
  });

  it('reads the environment at request time, not once at import', async () => {
    process.env.GIT_SHA = 'aaaaaaa';
    expect((await GET().json()).buildSha).toBe('aaaaaaa');
    process.env.GIT_SHA = 'bbbbbbb';
    expect((await GET().json()).buildSha).toBe('bbbbbbb');
  });
});
