import { expect, test } from '@playwright/test';

/**
 * .github/workflows/prod-drift.yml reads web-prod's build SHA from /api/health every
 * hour with no credentials (KAN-204). Against a real Next server, with no session
 * cookie: it must answer 200 JSON directly, not a login redirect or a locale redirect.
 */
test.describe('public health endpoint', () => {
  test('answers an anonymous request with the build identity and no redirect', async ({ request }) => {
    const response = await request.get('/api/health', { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toContain('no-store');
    const body = (await response.json()) as { status: string; service: string; buildSha: string | null };
    expect(body).toMatchObject({ status: 'ok', service: '@growthos/web' });
    expect(body).toHaveProperty('buildSha');
  });
});
