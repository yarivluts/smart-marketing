import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const { requireOrgMembershipMock, listOrgProjectsMock } = vi.hoisted(() => ({
  requireOrgMembershipMock: vi.fn(),
  listOrgProjectsMock: vi.fn(),
}));

vi.mock('@/lib/orgs/access', () => ({
  requireOrgMembership: requireOrgMembershipMock,
}));

vi.mock('@/lib/orgs/queries', () => ({
  listOrgProjects: listOrgProjectsMock,
}));

describe('Copilot Chat API Route', () => {
  const orgId = 'org-test-123';
  const projectId = 'proj-test-456';
  const mockParams = {
    params: Promise.resolve({ orgId, projectId }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    requireOrgMembershipMock.mockResolvedValue({
      membership: { id: 'mem-1', role: 'owner' },
      user: { id: 'usr-1', email: 'tester@example.com' },
    });
    listOrgProjectsMock.mockResolvedValue([
      { id: projectId, name: 'Acme SaaS', organizationId: orgId },
      { id: 'proj-other', name: 'Mobile App', organizationId: orgId },
    ]);
  });

  function createRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest('http://localhost:3000/api/copilot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('rejects unauthenticated requests if membership check fails', async () => {
    const errorResponse = new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    requireOrgMembershipMock.mockResolvedValueOnce({ error: errorResponse });

    const res = await POST(createRequest({ message: 'hello' }), mockParams);
    expect(res.status).toBe(401);
  });

  it('handles budget scale intent with proposal diff card and propose_action tool', async () => {
    const req = createRequest({ message: 'Scale Meta Retargeting budget to $300/day', locale: 'en' });
    const res = await POST(req, mockParams);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.message.role).toBe('assistant');
    expect(data.message.toolCalls[0].tool).toBe('mcp.propose_action');
    expect(data.message.actionProposal).toBeDefined();
    expect(data.message.actionProposal.afterValue).toBe('$300/day');
  });

  it('handles conversion funnel intent in Hebrew', async () => {
    const req = createRequest({ message: 'איפה יש נטישה במשפך ההמרה?', locale: 'he' });
    const res = await POST(req, mockParams);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.message.toolCalls[0].tool).toBe('mcp.query_funnel');
    expect(data.message.content).toContain('query_funnel');
    expect(data.message.content).toContain('ביקור ראשוני');
  });

  it('handles installation gap audit intent', async () => {
    const req = createRequest({ message: 'What installation gaps or missing tracking exist?', locale: 'en' });
    const res = await POST(req, mockParams);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.message.toolCalls).toHaveLength(2);
    expect(data.message.toolCalls[0].tool).toBe('mcp.audit_installation_gaps');
    expect(data.message.toolCalls[1].tool).toBe('mcp.get_setup_health');
    expect(data.message.content).toContain('Overall Readiness Score');
    expect(data.message.quickActions).toBeDefined();
  });

  it('handles tracking script intent in Hebrew', async () => {
    const req = createRequest({ message: 'הבא לי את סקריפט ה-SDK להטמעה', locale: 'he' });
    const res = await POST(req, mockParams);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.message.toolCalls[0].tool).toBe('mcp.get_tracking_script');
    expect(data.message.content).toContain('https://cdn.growthos.io/sdk.js');
    expect(data.message.content).toContain(projectId);
  });

  it('handles project and goals query intent', async () => {
    const req = createRequest({ message: 'What are the current goals for this project?', locale: 'en' });
    const res = await POST(req, mockParams);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.message.toolCalls[0].tool).toBe('mcp.list_goals');
    expect(data.message.toolCalls[1].tool).toBe('mcp.get_goal_progress');
    expect(data.message.content).toContain('Goal 1');
  });

  it('handles test event verification intent', async () => {
    const req = createRequest({ message: 'שלח אירוע בדיקה ואימות', locale: 'he' });
    const res = await POST(req, mockParams);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.message.toolCalls[0].tool).toBe('mcp.test_integration_event');
    expect(data.message.toolCalls[1].tool).toBe('mcp.verify_installation');
    expect(data.message.content).toContain('אירוע בדיקה הוזרק בהצלחה');
  });

  it('returns general assistance message mentioning 26 tools for fallback queries', async () => {
    const req = createRequest({ message: 'Hello there!', locale: 'en' });
    const res = await POST(req, mockParams);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.message.content).toContain('all 26 GrowthOS MCP tools');
  });
});
