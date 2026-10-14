import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSession, resolveOrgSessionContext, can } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  resolveOrgSessionContext: vi.fn(),
  can: vi.fn(),
}));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession }));
vi.mock('@/lib/orgs/session-context', () => ({ resolveOrgSessionContext }));
vi.mock('@growthos/shared', () => ({ can }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

import ProjectRootPage from './page';

const params = { params: Promise.resolve({ locale: 'he', orgId: 'o1', projectId: 'p1' }) };

describe('project root', () => {
  beforeEach(() => {
    getServerSession.mockResolvedValue({ uid: 'u1' });
    resolveOrgSessionContext.mockResolvedValue({ user: { id: 'u1' }, bindings: [] });
  });

  it('opens Growth Pilot first for someone who can use the AI', async () => {
    can.mockReturnValue(true);
    await expect(ProjectRootPage(params)).rejects.toThrow('REDIRECT:/he/orgs/o1/projects/p1/growth-pilot');
    expect(can).toHaveBeenCalledWith([], { type: 'user', id: 'u1' }, 'ai.use', { orgId: 'o1', projectId: 'p1' });
  });

  it('keeps Campaigns for someone who cannot open Growth Pilot', async () => {
    can.mockReturnValue(false);
    await expect(ProjectRootPage(params)).rejects.toThrow('REDIRECT:/he/orgs/o1/projects/p1/campaigns');
  });

  it('falls back to Campaigns without a session', async () => {
    getServerSession.mockResolvedValue(null);
    await expect(ProjectRootPage(params)).rejects.toThrow('REDIRECT:/he/orgs/o1/projects/p1/campaigns');
  });
});
