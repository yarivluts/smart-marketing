import { afterEach, describe, expect, it, vi } from 'vitest';

const { serverInit, edgeInit } = vi.hoisted(() => ({
  serverInit: vi.fn(),
  edgeInit: vi.fn(),
}));

vi.mock('./sentry.server.config', () => {
  serverInit();
  return {};
});
vi.mock('./sentry.edge.config', () => {
  edgeInit();
  return {};
});

afterEach(() => {
  serverInit.mockClear();
  edgeInit.mockClear();
  delete process.env.NEXT_RUNTIME;
});

describe('instrumentation register()', () => {
  it('loads the server Sentry config on the nodejs runtime', async () => {
    process.env.NEXT_RUNTIME = 'nodejs';
    const { register } = await import('./instrumentation');

    await register();

    expect(serverInit).toHaveBeenCalledTimes(1);
    expect(edgeInit).not.toHaveBeenCalled();
  });

  it('loads the edge Sentry config on the edge runtime', async () => {
    process.env.NEXT_RUNTIME = 'edge';
    const { register } = await import('./instrumentation');

    await register();

    expect(edgeInit).toHaveBeenCalledTimes(1);
    expect(serverInit).not.toHaveBeenCalled();
  });

  it('loads neither config when NEXT_RUNTIME is unset', async () => {
    delete process.env.NEXT_RUNTIME;
    const { register } = await import('./instrumentation');

    await register();

    expect(serverInit).not.toHaveBeenCalled();
    expect(edgeInit).not.toHaveBeenCalled();
  });
});
