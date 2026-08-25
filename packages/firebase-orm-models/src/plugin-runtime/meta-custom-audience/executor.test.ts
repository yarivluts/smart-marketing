import { describe, expect, it, vi } from 'vitest';
import { MetaAdsApiError, type MetaAdsApiClient } from '../meta-ads';
import { SinkPluginExecutionError } from '../executor';
import type { PluginRuntimeCredential } from '../credential';
import { hashEmailForMetaCustomAudience, hashPhoneForMetaCustomAudience } from './hashing';
import { MetaCustomAudienceSinkPluginExecutor } from './executor';

const CREDENTIAL: PluginRuntimeCredential = {
  token: 'fake-token',
  expiresAt: new Date().toISOString(),
  organizationId: 'org_1',
  projectId: 'proj_1',
  pluginInstallId: 'install_1',
  scopes: ['action:execute'],
};

function fakeApiClient(overrides: Partial<MetaAdsApiClient> = {}): MetaAdsApiClient {
  return {
    createCampaign: vi.fn(),
    createAdSet: vi.fn(),
    createAdCreative: vi.fn(),
    createAd: vi.fn(),
    setDailyBudgetCents: vi.fn(),
    setObjectStatus: vi.fn(),
    getCampaign: vi.fn(),
    createCustomAudience: vi.fn().mockResolvedValue({ audienceId: 'audience-new' }),
    addContactsToCustomAudience: vi.fn().mockResolvedValue({ numReceived: 0 }),
    ...overrides,
  };
}

function pushParams(records: readonly Record<string, unknown>[]): Parameters<MetaCustomAudienceSinkPluginExecutor['push']>[0] {
  return { organizationId: 'org_1', projectId: 'proj_1', pluginId: 'com.growthos.meta-custom-audience', config: {}, credential: CREDENTIAL, records };
}

describe('MetaCustomAudienceSinkPluginExecutor', () => {
  it('creates a new Custom Audience on first sync, hashes emails, and reports the audience id as externalRef', async () => {
    const apiClient = fakeApiClient({ addContactsToCustomAudience: vi.fn().mockResolvedValue({ numReceived: 2 }) });
    const executor = new MetaCustomAudienceSinkPluginExecutor({ apiClient, adAccountId: '999', audienceName: 'Warm leads', existingAudienceId: null });

    const result = await executor.push(pushParams([{ properties: { email: 'a@example.com' } }, { properties: { email: 'b@example.com' } }]));

    expect(apiClient.createCustomAudience).toHaveBeenCalledWith('999', { name: 'Warm leads' });
    expect(apiClient.addContactsToCustomAudience).toHaveBeenCalledWith('audience-new', [
      { emailHash: hashEmailForMetaCustomAudience('a@example.com') },
      { emailHash: hashEmailForMetaCustomAudience('b@example.com') },
    ]);
    expect(result).toEqual({ pushed: 2, externalRef: 'audience-new' });
  });

  it('reuses an already-known audience id and never creates a duplicate audience', async () => {
    const apiClient = fakeApiClient({ addContactsToCustomAudience: vi.fn().mockResolvedValue({ numReceived: 1 }) });
    const executor = new MetaCustomAudienceSinkPluginExecutor({ apiClient, adAccountId: '999', audienceName: 'Warm leads', existingAudienceId: 'audience-existing' });

    const result = await executor.push(pushParams([{ properties: { email: 'a@example.com' } }]));

    expect(apiClient.createCustomAudience).not.toHaveBeenCalled();
    expect(apiClient.addContactsToCustomAudience).toHaveBeenCalledWith('audience-existing', [{ emailHash: hashEmailForMetaCustomAudience('a@example.com') }]);
    expect(result).toEqual({ pushed: 1, externalRef: 'audience-existing' });
  });

  it('drops records with no usable email or phone field before hashing anything', async () => {
    const apiClient = fakeApiClient({ addContactsToCustomAudience: vi.fn().mockResolvedValue({ numReceived: 1 }) });
    const executor = new MetaCustomAudienceSinkPluginExecutor({ apiClient, adAccountId: '999', audienceName: 'Warm leads', existingAudienceId: 'audience-existing' });

    await executor.push(
      pushParams([
        { properties: { email: 'a@example.com' } },
        { properties: { email: '' } },
        { properties: { email: 42 } },
        { properties: { phone: '' } },
        { properties: { phone: 42 } },
        { properties: {} },
        { properties: null },
        {},
      ]),
    );

    expect(apiClient.addContactsToCustomAudience).toHaveBeenCalledWith('audience-existing', [{ emailHash: hashEmailForMetaCustomAudience('a@example.com') }]);
  });

  it('hashes a phone-only record and includes it as a phoneHash contact key', async () => {
    const apiClient = fakeApiClient({ addContactsToCustomAudience: vi.fn().mockResolvedValue({ numReceived: 1 }) });
    const executor = new MetaCustomAudienceSinkPluginExecutor({ apiClient, adAccountId: '999', audienceName: 'Warm leads', existingAudienceId: 'audience-existing' });

    const result = await executor.push(pushParams([{ properties: { phone: '+1 415-555-0100' } }]));

    expect(apiClient.addContactsToCustomAudience).toHaveBeenCalledWith('audience-existing', [{ phoneHash: hashPhoneForMetaCustomAudience('+1 415-555-0100') }]);
    expect(result).toEqual({ pushed: 1, externalRef: 'audience-existing' });
  });

  it('hashes both email and phone onto the same contact key when a record has both', async () => {
    const apiClient = fakeApiClient({ addContactsToCustomAudience: vi.fn().mockResolvedValue({ numReceived: 1 }) });
    const executor = new MetaCustomAudienceSinkPluginExecutor({ apiClient, adAccountId: '999', audienceName: 'Warm leads', existingAudienceId: 'audience-existing' });

    await executor.push(pushParams([{ properties: { email: 'a@example.com', phone: '+14155550100' } }]));

    expect(apiClient.addContactsToCustomAudience).toHaveBeenCalledWith('audience-existing', [
      { emailHash: hashEmailForMetaCustomAudience('a@example.com'), phoneHash: hashPhoneForMetaCustomAudience('+14155550100') },
    ]);
  });

  it('still resolves (creates or reuses) the audience but skips the users call when no record has a usable email or phone', async () => {
    const apiClient = fakeApiClient();
    const executor = new MetaCustomAudienceSinkPluginExecutor({ apiClient, adAccountId: '999', audienceName: 'Warm leads', existingAudienceId: null });

    const result = await executor.push(pushParams([{ properties: {} }]));

    expect(apiClient.createCustomAudience).toHaveBeenCalledWith('999', { name: 'Warm leads' });
    expect(apiClient.addContactsToCustomAudience).not.toHaveBeenCalled();
    expect(result).toEqual({ pushed: 0, externalRef: 'audience-new' });
  });

  it('reuses the audience it just created on a same-instance retry, instead of creating a second one', async () => {
    // Regression test: crm-sync.service.ts's syncSegmentToCrm retries a whole push() call on the
    // *same* executor instance via runWithRetryBackoff. If createCustomAudience already succeeded
    // and only the later addContactsToCustomAudience call failed transiently, the retried
    // push() must reuse the audience it already created rather than creating an orphaned duplicate.
    let addContactsAttempts = 0;
    const apiClient = fakeApiClient({
      addContactsToCustomAudience: vi.fn().mockImplementation(() => {
        addContactsAttempts += 1;
        if (addContactsAttempts === 1) {
          return Promise.reject(new MetaAdsApiError('Meta Graph API request failed with status 500', 500));
        }
        return Promise.resolve({ numReceived: 1 });
      }),
    });
    const executor = new MetaCustomAudienceSinkPluginExecutor({ apiClient, adAccountId: '999', audienceName: 'Warm leads', existingAudienceId: null });
    const params = pushParams([{ properties: { email: 'a@example.com' } }]);

    await expect(executor.push(params)).rejects.toBeInstanceOf(SinkPluginExecutionError);
    const result = await executor.push(params);

    expect(apiClient.createCustomAudience).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ pushed: 1, externalRef: 'audience-new' });
  });

  it('wraps a MetaAdsApiError as SinkPluginExecutionError', async () => {
    const apiClient = fakeApiClient({ createCustomAudience: vi.fn().mockRejectedValue(new MetaAdsApiError('Meta Graph API request failed with status 400', 400)) });
    const executor = new MetaCustomAudienceSinkPluginExecutor({ apiClient, adAccountId: '999', audienceName: 'Warm leads', existingAudienceId: null });

    await expect(executor.push(pushParams([{ properties: { email: 'a@example.com' } }]))).rejects.toBeInstanceOf(SinkPluginExecutionError);
  });

  it('rethrows a non-api error unchanged', async () => {
    const boom = new Error('network down');
    const apiClient = fakeApiClient({ createCustomAudience: vi.fn().mockRejectedValue(boom) });
    const executor = new MetaCustomAudienceSinkPluginExecutor({ apiClient, adAccountId: '999', audienceName: 'Warm leads', existingAudienceId: null });

    await expect(executor.push(pushParams([{ properties: { email: 'a@example.com' } }]))).rejects.toBe(boom);
  });
});
