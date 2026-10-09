import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAttributionTelemetry } from './attribution.service';
import { ProjectModel } from '../models/project.model';
import { RawRecordModel } from '../models/raw-record.model';
import { ProjectNotFoundError } from './resource-library.service';

vi.mock('../models/project.model', () => ({
  ProjectModel: {
    init: vi.fn(),
  },
}));

vi.mock('../models/raw-record.model', () => ({
  RawRecordModel: {
    initPath: vi.fn(),
  },
}));

describe('attribution.service (@growthos/firebase-orm-models)', () => {
  const orgId = 'org_test_123';
  const projectId = 'proj_test_456';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns baseline telemetry for demo-org and demo-project without querying db', async () => {
    const result = await getAttributionTelemetry('demo-org', 'demo-project', { lookbackDays: 60 });
    expect(result.kpis.totalAttributedRevenue).toBe(298400);
    expect(result.kpis.verifiedConversions).toBe(1140);
    expect(result.channels.length).toBeGreaterThanOrEqual(3);
    expect(ProjectModel.init).not.toHaveBeenCalled();
  });

  it('throws ProjectNotFoundError if project does not exist in org', async () => {
    (ProjectModel.init as any).mockResolvedValue(null);

    await expect(getAttributionTelemetry(orgId, projectId)).rejects.toThrow(ProjectNotFoundError);
  });

  it('returns baseline telemetry when project has no landed raw records', async () => {
    (ProjectModel.init as any).mockResolvedValue({
      id: projectId,
      organization_id: orgId,
    });

    const getMock = vi.fn().mockResolvedValue([]);
    const limitMock = vi.fn().mockReturnValue({ get: getMock });
    const whereMock2 = vi.fn().mockReturnValue({ limit: limitMock });
    const whereMock1 = vi.fn().mockReturnValue({ where: whereMock2 });

    (RawRecordModel.initPath as any).mockReturnValue({
      where: whereMock1,
    });

    const result = await getAttributionTelemetry(orgId, projectId, { lookbackDays: 90 });
    expect(result.kpis.totalAttributedRevenue).toBe(298400);
    expect(result.sensitivity.lookbackDays).toBe(90);
    expect(result.ingestionHealth.status).toBe('healthy');
  });

  it('synthesizes multi-touch attribution matrix from landed raw records', async () => {
    (ProjectModel.init as any).mockResolvedValue({
      id: projectId,
      organization_id: orgId,
    });

    const mockRecords = [
      {
        id: 'rec_1',
        kind: 'event',
        landed_at: new Date(Date.now() - 50000).toISOString(),
        payload: {
          user_id: 'user_1',
          event: 'touchpoint',
          channel: 'meta_ads',
          ts: new Date(Date.now() - 50000).toISOString(),
        },
      },
      {
        id: 'rec_2',
        kind: 'event',
        landed_at: new Date(Date.now() - 20000).toISOString(),
        payload: {
          user_id: 'user_1',
          event: 'touchpoint',
          channel: 'google_search',
          ts: new Date(Date.now() - 20000).toISOString(),
        },
      },
      {
        id: 'rec_3',
        kind: 'event',
        landed_at: new Date().toISOString(),
        payload: {
          user_id: 'user_1',
          event: 'purchase',
          revenue: 150,
          ts: new Date().toISOString(),
        },
      },
      {
        id: 'rec_4',
        kind: 'event',
        landed_at: new Date(Date.now() - 40000).toISOString(),
        payload: {
          user_id: 'user_2',
          event: 'touchpoint',
          channel: 'tiktok_ugc',
          ts: new Date(Date.now() - 40000).toISOString(),
        },
      },
      {
        id: 'rec_5',
        kind: 'event',
        landed_at: new Date().toISOString(),
        payload: {
          user_id: 'user_2',
          event: 'signup',
          revenue: 250,
          ts: new Date().toISOString(),
        },
      },
      {
        id: 'rec_6',
        kind: 'event',
        landed_at: new Date(Date.now() - 30000).toISOString(),
        payload: {
          user_id: 'user_3',
          event: 'touchpoint',
          channel: 'google_search',
          ts: new Date(Date.now() - 30000).toISOString(),
        },
      },
      {
        id: 'rec_7',
        kind: 'event',
        landed_at: new Date().toISOString(),
        payload: {
          user_id: 'user_3',
          event: 'purchase',
          revenue: 200,
          ts: new Date().toISOString(),
        },
      },
    ];

    const getMock = vi.fn().mockResolvedValue(mockRecords);
    const limitMock = vi.fn().mockReturnValue({ get: getMock });
    const whereMock2 = vi.fn().mockReturnValue({ limit: limitMock });
    const whereMock1 = vi.fn().mockReturnValue({ where: whereMock2 });

    (RawRecordModel.initPath as any).mockReturnValue({
      where: whereMock1,
    });

    const result = await getAttributionTelemetry(orgId, projectId, { lookbackDays: 30 });
    expect(result.kpis.totalAttributedRevenue).toBe(600); // 150 + 250 + 200
    expect(result.kpis.verifiedConversions).toBe(3);
    expect(result.channels.length).toBeGreaterThanOrEqual(3);
  });
});
