import { describe, expect, it, vi } from 'vitest';
import { GoogleAdsApiError, type GoogleAdsApiClient } from '../google-ads';
import { SinkPluginExecutionError } from '../executor';
import type { PluginRuntimeCredential } from '../credential';
import { hashEmailForGoogleCustomerMatch, hashPhoneForGoogleCustomerMatch, normalizeMobileIdForGoogleCustomerMatch } from './hashing';
import { GoogleCustomerMatchSinkPluginExecutor } from './executor';

const CREDENTIAL: PluginRuntimeCredential = {
  token: 'fake-token',
  expiresAt: new Date().toISOString(),
  organizationId: 'org_1',
  projectId: 'proj_1',
  pluginInstallId: 'install_1',
  scopes: ['action:execute'],
};

function fakeApiClient(overrides: Partial<GoogleAdsApiClient> = {}): GoogleAdsApiClient {
  return {
    createCampaignDraft: vi.fn(),
    setCampaignBudgetAmount: vi.fn(),
    setCampaignStatus: vi.fn(),
    lookupCampaignBudgetResourceName: vi.fn(),
    createCustomerMatchUserList: vi.fn().mockResolvedValue({ userListResourceName: 'customers/999/userLists/new' }),
    addContactsToCustomerMatchUserList: vi.fn().mockResolvedValue({ numReceived: 0 }),
    ...overrides,
  };
}

function pushParams(records: readonly Record<string, unknown>[]): Parameters<GoogleCustomerMatchSinkPluginExecutor['push']>[0] {
  return { organizationId: 'org_1', projectId: 'proj_1', pluginId: 'com.growthos.google-customer-match', config: {}, credential: CREDENTIAL, records };
}

describe('GoogleCustomerMatchSinkPluginExecutor', () => {
  it('creates a new Customer Match user list on first sync, hashes emails, and reports the list resource name as externalRef', async () => {
    const apiClient = fakeApiClient({ addContactsToCustomerMatchUserList: vi.fn().mockResolvedValue({ numReceived: 2 }) });
    const executor = new GoogleCustomerMatchSinkPluginExecutor({ apiClient, customerId: '999', userListName: 'Warm leads', existingUserListResourceName: null });

    const result = await executor.push(pushParams([{ properties: { email: 'a@example.com' } }, { properties: { email: 'b@example.com' } }]));

    expect(apiClient.createCustomerMatchUserList).toHaveBeenCalledWith('999', { name: 'Warm leads' });
    expect(apiClient.addContactsToCustomerMatchUserList).toHaveBeenCalledWith('999', 'customers/999/userLists/new', [
      { hashedEmail: hashEmailForGoogleCustomerMatch('a@example.com') },
      { hashedEmail: hashEmailForGoogleCustomerMatch('b@example.com') },
    ]);
    expect(result).toEqual({ pushed: 2, externalRef: 'customers/999/userLists/new' });
  });

  it('reuses an already-known user list resource name and never creates a duplicate list', async () => {
    const apiClient = fakeApiClient({ addContactsToCustomerMatchUserList: vi.fn().mockResolvedValue({ numReceived: 1 }) });
    const executor = new GoogleCustomerMatchSinkPluginExecutor({
      apiClient,
      customerId: '999',
      userListName: 'Warm leads',
      existingUserListResourceName: 'customers/999/userLists/existing',
    });

    const result = await executor.push(pushParams([{ properties: { email: 'a@example.com' } }]));

    expect(apiClient.createCustomerMatchUserList).not.toHaveBeenCalled();
    expect(apiClient.addContactsToCustomerMatchUserList).toHaveBeenCalledWith('999', 'customers/999/userLists/existing', [
      { hashedEmail: hashEmailForGoogleCustomerMatch('a@example.com') },
    ]);
    expect(result).toEqual({ pushed: 1, externalRef: 'customers/999/userLists/existing' });
  });

  it('drops records with no usable email, phone, or device id field before hashing anything', async () => {
    const apiClient = fakeApiClient({ addContactsToCustomerMatchUserList: vi.fn().mockResolvedValue({ numReceived: 1 }) });
    const executor = new GoogleCustomerMatchSinkPluginExecutor({
      apiClient,
      customerId: '999',
      userListName: 'Warm leads',
      existingUserListResourceName: 'customers/999/userLists/existing',
    });

    await executor.push(
      pushParams([
        { properties: { email: 'a@example.com' } },
        { properties: { email: '' } },
        { properties: { email: 42 } },
        { properties: { phone: '' } },
        { properties: { phone: 42 } },
        { properties: { device_id: '' } },
        { properties: { device_id: 42 } },
        { properties: {} },
        { properties: null },
        {},
      ]),
    );

    expect(apiClient.addContactsToCustomerMatchUserList).toHaveBeenCalledWith('999', 'customers/999/userLists/existing', [
      { hashedEmail: hashEmailForGoogleCustomerMatch('a@example.com') },
    ]);
  });

  it('hashes a phone-only record and includes it as a hashedPhoneNumber contact key', async () => {
    const apiClient = fakeApiClient({ addContactsToCustomerMatchUserList: vi.fn().mockResolvedValue({ numReceived: 1 }) });
    const executor = new GoogleCustomerMatchSinkPluginExecutor({
      apiClient,
      customerId: '999',
      userListName: 'Warm leads',
      existingUserListResourceName: 'customers/999/userLists/existing',
    });

    const result = await executor.push(pushParams([{ properties: { phone: '+1 415-555-0100' } }]));

    expect(apiClient.addContactsToCustomerMatchUserList).toHaveBeenCalledWith('999', 'customers/999/userLists/existing', [
      { hashedPhoneNumber: hashPhoneForGoogleCustomerMatch('+1 415-555-0100') },
    ]);
    expect(result).toEqual({ pushed: 1, externalRef: 'customers/999/userLists/existing' });
  });

  it('hashes both email and phone onto the same contact key when a record has both', async () => {
    const apiClient = fakeApiClient({ addContactsToCustomerMatchUserList: vi.fn().mockResolvedValue({ numReceived: 1 }) });
    const executor = new GoogleCustomerMatchSinkPluginExecutor({
      apiClient,
      customerId: '999',
      userListName: 'Warm leads',
      existingUserListResourceName: 'customers/999/userLists/existing',
    });

    await executor.push(pushParams([{ properties: { email: 'a@example.com', phone: '+14155550100' } }]));

    expect(apiClient.addContactsToCustomerMatchUserList).toHaveBeenCalledWith('999', 'customers/999/userLists/existing', [
      { hashedEmail: hashEmailForGoogleCustomerMatch('a@example.com'), hashedPhoneNumber: hashPhoneForGoogleCustomerMatch('+14155550100') },
    ]);
  });

  it('normalizes (but does not hash) a device-id-only record and includes it as a mobileId contact key', async () => {
    const apiClient = fakeApiClient({ addContactsToCustomerMatchUserList: vi.fn().mockResolvedValue({ numReceived: 1 }) });
    const executor = new GoogleCustomerMatchSinkPluginExecutor({
      apiClient,
      customerId: '999',
      userListName: 'Warm leads',
      existingUserListResourceName: 'customers/999/userLists/existing',
    });

    const result = await executor.push(pushParams([{ properties: { device_id: '38400000-8CF0-11BD-B23E-10B96E4EF00D' } }]));

    expect(apiClient.addContactsToCustomerMatchUserList).toHaveBeenCalledWith('999', 'customers/999/userLists/existing', [
      { mobileId: normalizeMobileIdForGoogleCustomerMatch('38400000-8CF0-11BD-B23E-10B96E4EF00D') },
    ]);
    expect(result).toEqual({ pushed: 1, externalRef: 'customers/999/userLists/existing' });
  });

  it('combines email, phone, and device id onto the same contact key when a record has all three', async () => {
    const apiClient = fakeApiClient({ addContactsToCustomerMatchUserList: vi.fn().mockResolvedValue({ numReceived: 1 }) });
    const executor = new GoogleCustomerMatchSinkPluginExecutor({
      apiClient,
      customerId: '999',
      userListName: 'Warm leads',
      existingUserListResourceName: 'customers/999/userLists/existing',
    });

    await executor.push(pushParams([{ properties: { email: 'a@example.com', phone: '+14155550100', device_id: '38400000-8cf0-11bd-b23e-10b96e4ef00d' } }]));

    expect(apiClient.addContactsToCustomerMatchUserList).toHaveBeenCalledWith('999', 'customers/999/userLists/existing', [
      {
        hashedEmail: hashEmailForGoogleCustomerMatch('a@example.com'),
        hashedPhoneNumber: hashPhoneForGoogleCustomerMatch('+14155550100'),
        mobileId: normalizeMobileIdForGoogleCustomerMatch('38400000-8cf0-11bd-b23e-10b96e4ef00d'),
      },
    ]);
  });

  it('still resolves (creates or reuses) the user list but skips the upload call when no record has a usable email or phone', async () => {
    const apiClient = fakeApiClient();
    const executor = new GoogleCustomerMatchSinkPluginExecutor({ apiClient, customerId: '999', userListName: 'Warm leads', existingUserListResourceName: null });

    const result = await executor.push(pushParams([{ properties: {} }]));

    expect(apiClient.createCustomerMatchUserList).toHaveBeenCalledWith('999', { name: 'Warm leads' });
    expect(apiClient.addContactsToCustomerMatchUserList).not.toHaveBeenCalled();
    expect(result).toEqual({ pushed: 0, externalRef: 'customers/999/userLists/new' });
  });

  it('reuses the user list it just created on a same-instance retry, instead of creating a second one', async () => {
    // Regression test: crm-sync.service.ts's syncSegmentToCrm retries a whole push() call on the
    // *same* executor instance via runWithRetryBackoff. If createCustomerMatchUserList already
    // succeeded and only the later addContactsToCustomerMatchUserList call failed transiently,
    // the retried push() must reuse the list it already created rather than creating an orphaned
    // duplicate — the exact same fix MetaCustomAudienceSinkPluginExecutor already applies.
    let addContactsAttempts = 0;
    const apiClient = fakeApiClient({
      addContactsToCustomerMatchUserList: vi.fn().mockImplementation(() => {
        addContactsAttempts += 1;
        if (addContactsAttempts === 1) {
          return Promise.reject(new GoogleAdsApiError('Google Ads API request failed with status 500', 500));
        }
        return Promise.resolve({ numReceived: 1 });
      }),
    });
    const executor = new GoogleCustomerMatchSinkPluginExecutor({ apiClient, customerId: '999', userListName: 'Warm leads', existingUserListResourceName: null });
    const params = pushParams([{ properties: { email: 'a@example.com' } }]);

    await expect(executor.push(params)).rejects.toBeInstanceOf(SinkPluginExecutionError);
    const result = await executor.push(params);

    expect(apiClient.createCustomerMatchUserList).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ pushed: 1, externalRef: 'customers/999/userLists/new' });
  });

  it('wraps a GoogleAdsApiError as SinkPluginExecutionError', async () => {
    const apiClient = fakeApiClient({ createCustomerMatchUserList: vi.fn().mockRejectedValue(new GoogleAdsApiError('Google Ads API request failed with status 400', 400)) });
    const executor = new GoogleCustomerMatchSinkPluginExecutor({ apiClient, customerId: '999', userListName: 'Warm leads', existingUserListResourceName: null });

    await expect(executor.push(pushParams([{ properties: { email: 'a@example.com' } }]))).rejects.toBeInstanceOf(SinkPluginExecutionError);
  });

  it('rethrows a non-api error unchanged', async () => {
    const boom = new Error('network down');
    const apiClient = fakeApiClient({ createCustomerMatchUserList: vi.fn().mockRejectedValue(boom) });
    const executor = new GoogleCustomerMatchSinkPluginExecutor({ apiClient, customerId: '999', userListName: 'Warm leads', existingUserListResourceName: null });

    await expect(executor.push(pushParams([{ properties: { email: 'a@example.com' } }]))).rejects.toBe(boom);
  });
});
