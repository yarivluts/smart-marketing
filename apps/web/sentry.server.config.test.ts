import { describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ init: vi.fn() }));

describe('sentry.server.config', () => {
  it('initializes Sentry tagged as the server runtime', async () => {
    const Sentry = await import('@sentry/nextjs');
    await import('./sentry.server.config');

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ initialScope: { tags: { runtime: 'server' } } }),
    );
  });
});
