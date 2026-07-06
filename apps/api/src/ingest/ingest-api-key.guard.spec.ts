import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { verifyApiKeyForRequest } from '@growthos/firebase-orm-models';
import { IngestApiKeyGuard, type IngestRequest } from './ingest-api-key.guard';

jest.mock('@growthos/firebase-orm-models', () => ({
  verifyApiKeyForRequest: jest.fn(),
}));

const mockedVerify = verifyApiKeyForRequest as jest.MockedFunction<typeof verifyApiKeyForRequest>;

function contextFor(request: IngestRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('IngestApiKeyGuard', () => {
  const guard = new IngestApiKeyGuard();

  beforeEach(() => {
    mockedVerify.mockReset();
  });

  it('rejects a request with no Authorization header', async () => {
    const request: IngestRequest = { headers: {}, params: { organizationId: 'o1', projectId: 'p1', environmentId: 'e1' } };
    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(UnauthorizedException);
    expect(mockedVerify).not.toHaveBeenCalled();
  });

  it('rejects a malformed (non-Bearer) Authorization header', async () => {
    const request: IngestRequest = {
      headers: { authorization: 'Basic abc123' },
      params: { organizationId: 'o1', projectId: 'p1', environmentId: 'e1' },
    };
    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when the path is missing organization/project/environment', async () => {
    const request: IngestRequest = { headers: { authorization: 'Bearer gos_test_abc' }, params: {} };
    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(ForbiddenException);
    expect(mockedVerify).not.toHaveBeenCalled();
  });

  it('rejects when verifyApiKeyForRequest reports a failure (wrong project/env/scope, revoked, invalid)', async () => {
    mockedVerify.mockResolvedValue({ ok: false, error: 'This API key does not carry the required scope.' });
    const request: IngestRequest = {
      headers: { authorization: 'Bearer gos_test_abc' },
      params: { organizationId: 'o1', projectId: 'p1', environmentId: 'e1' },
    };
    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(ForbiddenException);
    expect(mockedVerify).toHaveBeenCalledWith({
      rawKey: 'gos_test_abc',
      organizationId: 'o1',
      projectId: 'p1',
      environmentId: 'e1',
      requiredScope: 'ingest.write',
    });
  });

  it('allows the request through and attaches the auth context on success', async () => {
    const authContext = {
      apiKey: {} as never,
      organizationId: 'o1',
      projectId: 'p1',
      environmentId: 'e1',
      scopes: ['ingest.write'] as const,
    };
    mockedVerify.mockResolvedValue({ ok: true, value: authContext });
    const request: IngestRequest = {
      headers: { authorization: 'Bearer gos_test_abc' },
      params: { organizationId: 'o1', projectId: 'p1', environmentId: 'e1' },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.ingestAuth).toBe(authContext);
  });
});
