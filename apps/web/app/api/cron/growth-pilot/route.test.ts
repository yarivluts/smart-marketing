// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { verify, run } = vi.hoisted(() => ({ verify: vi.fn(), run: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/cron/verify-scheduler', () => ({ verifySchedulerRequest: verify }));
vi.mock('@/lib/ad-studio/engine', () => ({
  resolveAdStudioLlm: () => ({ provider: 'gemini', model: 'm' }),
  resolveAdStudioAutopilotDeps: () => ({}),
  resolveAdStudioImageDeps: () => ({}),
  resolveAdStudioVideoDeps: () => ({}),
  runScheduledGrowthPilots: run,
}));

import { POST } from './route';

afterEach(() => {
  verify.mockReset();
  run.mockReset();
});

const call = (auth?: string) => POST(new NextRequest('https://app.growthos.io/api/cron/growth-pilot', { method: 'POST', headers: auth ? { authorization: auth } : {} }));

describe('POST /api/cron/growth-pilot', () => {
  it('refuses anything but the scheduler, without running a single pilot', async () => {
    verify.mockResolvedValue(false);
    const response = await call('Bearer forged');
    expect(response.status).toBe(401);
    expect(verify).toHaveBeenCalledWith('Bearer forged');
    expect(run).not.toHaveBeenCalled();
  });

  it('runs the pilots within an eight-minute budget, with landing links on this origin, and reports what it did', async () => {
    verify.mockResolvedValue(true);
    run.mockResolvedValue([
      { organizationId: 'o', projectId: 'p', units: 3, outcome: 'worked' },
      { organizationId: 'o', projectId: 'q', units: 0, outcome: 'idle' },
    ]);
    const response = await call('Bearer real');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ pilots: 2, units: 3 });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ budgetMs: 8 * 60_000, publicWebUrl: 'https://app.growthos.io' }));
  });
});
