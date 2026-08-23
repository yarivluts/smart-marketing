import { describe, expect, it, vi } from 'vitest';
import type { CrmWebhookApiClient, CrmWebhookPushParams } from './api-client';
import { CrmWebhookApiError } from './api-client';
import { CrmWebhookSinkPluginExecutor } from './executor';
import { SinkPluginExecutionError } from '../executor';
import type { PluginRuntimeCredential } from '../credential';

const CREDENTIAL: PluginRuntimeCredential = {
  token: 'fake-token',
  expiresAt: new Date().toISOString(),
  organizationId: 'org_1',
  projectId: 'proj_1',
  pluginInstallId: 'install_1',
  scopes: ['action:execute'],
};

function fakeApiClient(overrides: Partial<CrmWebhookApiClient> = {}): CrmWebhookApiClient {
  return {
    pushRecords: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('CrmWebhookSinkPluginExecutor', () => {
  it('pushes every record via the api client and reports how many were pushed', async () => {
    const apiClient = fakeApiClient();
    const executor = new CrmWebhookSinkPluginExecutor({ apiClient, webhookUrl: 'https://crm.example.com/hook', bearerToken: 'tok_abc' });

    const records = [{ entity_id: 'cust_1' }, { entity_id: 'cust_2' }];
    const result = await executor.push({ organizationId: 'org_1', projectId: 'proj_1', pluginId: 'com.growthos.crm-webhook', config: {}, credential: CREDENTIAL, records });

    expect(result).toEqual({ pushed: 2 });
    expect(apiClient.pushRecords).toHaveBeenCalledWith({ webhookUrl: 'https://crm.example.com/hook', bearerToken: 'tok_abc', records });
  });

  it('reports zero pushed for an empty batch, without calling the api client', async () => {
    const apiClient = fakeApiClient();
    const executor = new CrmWebhookSinkPluginExecutor({ apiClient, webhookUrl: 'https://crm.example.com/hook', bearerToken: 'tok_abc' });

    const result = await executor.push({ organizationId: 'org_1', projectId: 'proj_1', pluginId: 'com.growthos.crm-webhook', config: {}, credential: CREDENTIAL, records: [] });

    expect(result).toEqual({ pushed: 0 });
    expect(apiClient.pushRecords).toHaveBeenCalledWith({ webhookUrl: 'https://crm.example.com/hook', bearerToken: 'tok_abc', records: [] });
  });

  it('wraps a CrmWebhookApiError as SinkPluginExecutionError', async () => {
    const apiClient = fakeApiClient({
      pushRecords: (_params: CrmWebhookPushParams) => Promise.reject(new CrmWebhookApiError('CRM webhook request failed with status 502', 502)),
    });
    const executor = new CrmWebhookSinkPluginExecutor({ apiClient, webhookUrl: 'https://crm.example.com/hook', bearerToken: 'tok_abc' });

    await expect(
      executor.push({ organizationId: 'org_1', projectId: 'proj_1', pluginId: 'com.growthos.crm-webhook', config: {}, credential: CREDENTIAL, records: [{ entity_id: 'cust_1' }] }),
    ).rejects.toBeInstanceOf(SinkPluginExecutionError);
  });

  it('rethrows a non-api error unchanged', async () => {
    const boom = new Error('network down');
    const apiClient = fakeApiClient({ pushRecords: () => Promise.reject(boom) });
    const executor = new CrmWebhookSinkPluginExecutor({ apiClient, webhookUrl: 'https://crm.example.com/hook', bearerToken: 'tok_abc' });

    await expect(
      executor.push({ organizationId: 'org_1', projectId: 'proj_1', pluginId: 'com.growthos.crm-webhook', config: {}, credential: CREDENTIAL, records: [] }),
    ).rejects.toBe(boom);
  });
});
