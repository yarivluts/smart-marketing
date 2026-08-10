import { describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ init: vi.fn() }));

describe('instrumentation-client', () => {
  it('initializes Sentry tagged as the client runtime', async () => {
    const Sentry = await import('@sentry/nextjs');
    await import('./instrumentation-client');

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ initialScope: { tags: { runtime: 'client' } } }),
    );
  });
});
