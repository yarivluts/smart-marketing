import { describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ init: vi.fn() }));

describe('sentry.edge.config', () => {
  it('initializes Sentry tagged as the edge runtime', async () => {
    const Sentry = await import('@sentry/nextjs');
    await import('./sentry.edge.config');

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ initialScope: { tags: { runtime: 'edge' } } }),
    );
  });
});
