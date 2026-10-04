import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  verifyStreamForRequirement,
  STREAM_REQUIREMENT_MATCHERS,
} from './setup-stream-verifier';
import { RawRecordModel, listRecentIngestBatchesForProject, ingestBatch } from '@growthos/firebase-orm-models';
import { listOrgProjects } from '@/lib/orgs/queries';
import {
  updateProjectDetails,
  ensurePluginInstall,
  disablePluginInstallByPluginId,
} from '@/lib/orgs/mutations';

vi.mock('@/lib/firebase/firestore', () => ({
  ensureFirestoreOrm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@growthos/firebase-orm-models', () => {
  const getMock = vi.fn().mockResolvedValue([]);
  const limitMock = vi.fn().mockReturnValue({ get: getMock });
  const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
  const queryMock = vi.fn().mockReturnValue({ orderBy: orderByMock, limit: limitMock, get: getMock });

  return {
    RawRecordModel: {
      initPath: vi.fn().mockReturnValue({ query: queryMock }),
    },
    listRecentIngestBatchesForProject: vi.fn().mockResolvedValue([]),
    ingestBatch: vi.fn().mockResolvedValue({ batchId: 'batch_mock_123', accepted: 1 }),
    listEnvironmentsForProject: vi.fn().mockResolvedValue([{ id: 'env_prod' }]),
  };
});

vi.mock('@/lib/orgs/queries', () => ({
  listOrgProjects: vi.fn(),
}));

vi.mock('@/lib/orgs/mutations', () => ({
  updateProjectDetails: vi.fn().mockResolvedValue({ id: 'proj-123' }),
  ensurePluginInstall: vi.fn().mockResolvedValue(undefined),
  disablePluginInstallByPluginId: vi.fn().mockResolvedValue(undefined),
}));

describe('setup-stream-verifier', () => {
  const mockOrgId = 'org_alpha';
  const mockProjectId = 'proj_123';
  const mockProject = {
    id: mockProjectId,
    name: 'Alpha Project',
    vertical: 'saas_subscription',
    platform_type: 'web',
    business_model: 'saas_subscription',
    transaction_type: 'monthly_recurring',
    primary_stack: 'custom_web',
    verified_requirements: ['req_web_sdk'],
    custom_hidden_modules: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listOrgProjects).mockResolvedValue([mockProject as any]);
  });

  it('detects live raw records within the 24h window and marks requirement as verified', async () => {
    const recentLanded = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
    const mockRecord = {
      id: 'rec_1',
      kind: 'event',
      schema_name: 'customer_transaction',
      landed_at: recentLanded,
      payload: { event: 'purchase' },
    };

    const getMock = vi.fn().mockResolvedValue([mockRecord]);
    const limitMock = vi.fn().mockReturnValue({ get: getMock });
    const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
    const queryMock = vi.fn().mockReturnValue({ orderBy: orderByMock, limit: limitMock, get: getMock });
    vi.mocked(RawRecordModel.initPath).mockReturnValue({ query: queryMock } as any);

    const result = await verifyStreamForRequirement({
      organizationId: mockOrgId,
      projectId: mockProjectId,
      requirementId: 'req_checkout_stream',
      lookbackHours: 24,
      action: 'verify',
    });

    expect(result.success).toBe(true);
    expect(result.liveDetected).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.recordCount).toBe(1);
    expect(result.latestRecordAt).toBe(recentLanded);
    expect(result.verifiedRequirements).toContain('req_checkout_stream');

    expect(updateProjectDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: mockOrgId,
        projectId: mockProjectId,
        verifiedRequirements: expect.arrayContaining(['req_web_sdk', 'req_checkout_stream']),
      }),
    );
    expect(ensurePluginInstall).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: mockOrgId,
        projectId: mockProjectId,
        pluginId: 'stripe',
      }),
    );
  });

  it('reports liveDetected: false when raw records are older than lookback window', async () => {
    const staleLanded = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48 hours ago
    const mockRecord = {
      id: 'rec_old',
      kind: 'event',
      schema_name: 'customer_transaction',
      landed_at: staleLanded,
      payload: { event: 'purchase' },
    };

    const getMock = vi.fn().mockResolvedValue([mockRecord]);
    const limitMock = vi.fn().mockReturnValue({ get: getMock });
    const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
    const queryMock = vi.fn().mockReturnValue({ orderBy: orderByMock, limit: limitMock, get: getMock });
    vi.mocked(RawRecordModel.initPath).mockReturnValue({ query: queryMock } as any);

    const result = await verifyStreamForRequirement({
      organizationId: mockOrgId,
      projectId: mockProjectId,
      requirementId: 'req_checkout_stream',
      lookbackHours: 24,
      action: 'check',
    });

    expect(result.success).toBe(true);
    expect(result.liveDetected).toBe(false);
    expect(result.recordCount).toBe(0);
    expect(result.testResult.status).toBe('pending');
  });

  it('synthesizes a verified pipeline test event when simulateTestEvent is true and no records exist', async () => {
    const getMock = vi.fn().mockResolvedValue([]);
    const limitMock = vi.fn().mockReturnValue({ get: getMock });
    const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
    const queryMock = vi.fn().mockReturnValue({ orderBy: orderByMock, limit: limitMock, get: getMock });
    vi.mocked(RawRecordModel.initPath).mockReturnValue({ query: queryMock } as any);

    const result = await verifyStreamForRequirement({
      organizationId: mockOrgId,
      projectId: mockProjectId,
      requirementId: 'req_checkout_stream',
      lookbackHours: 24,
      action: 'verify',
      simulateTestEvent: true,
    });

    expect(result.success).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.testResult.batchId).toBe('batch_mock_123');
    expect(ingestBatch).toHaveBeenCalled();
    expect(ensurePluginInstall).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: mockOrgId,
        projectId: mockProjectId,
        pluginId: 'stripe',
      }),
    );
  });

  it('unverifies a requirement and disables its connector when action is unverify', async () => {
    const getMock = vi.fn().mockResolvedValue([]);
    const limitMock = vi.fn().mockReturnValue({ get: getMock });
    const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
    const queryMock = vi.fn().mockReturnValue({ orderBy: orderByMock, limit: limitMock, get: getMock });
    vi.mocked(RawRecordModel.initPath).mockReturnValue({ query: queryMock } as any);

    const result = await verifyStreamForRequirement({
      organizationId: mockOrgId,
      projectId: mockProjectId,
      requirementId: 'req_web_sdk',
      action: 'unverify',
    });

    expect(result.success).toBe(true);
    expect(result.verified).toBe(false);
    expect(result.verifiedRequirements).not.toContain('req_web_sdk');
    expect(disablePluginInstallByPluginId).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: mockOrgId,
        projectId: mockProjectId,
        pluginId: 'growthos_sdk',
      }),
    );
  });

  it('throws an error if project is not found', async () => {
    vi.mocked(listOrgProjects).mockResolvedValue([]);

    await expect(
      verifyStreamForRequirement({
        organizationId: mockOrgId,
        projectId: 'non_existent',
        requirementId: 'req_web_sdk',
      }),
    ).rejects.toThrow('Project not found');
  });
});
