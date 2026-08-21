import { listRoleBindingsForUser } from '@growthos/firebase-orm-models';
import type { RoleBindingModel } from '@growthos/firebase-orm-models';
import { mcpCallerHasPermission } from './mcp-act-authorization';
import type { McpAuthContext } from './mcp-auth.guard';

jest.mock('@growthos/firebase-orm-models', () => {
  const actual = jest.requireActual('@growthos/firebase-orm-models');
  return { ...actual, listRoleBindingsForUser: jest.fn() };
});

const mockListRoleBindingsForUser = listRoleBindingsForUser as jest.MockedFunction<typeof listRoleBindingsForUser>;

function apiKeyAuth(scopes: McpAuthContext['scopes']): McpAuthContext {
  return { organizationId: 'org-1', projectId: 'proj-1', principalKind: 'api_key', scopes, apiKeyId: 'key-1', environmentId: 'env-1' };
}

function oauthAuth(overrides: Partial<McpAuthContext> = {}): McpAuthContext {
  return { organizationId: 'org-1', projectId: 'proj-1', principalKind: 'oauth', userId: 'user-1', grantId: 'grant-1', clientId: 'client-1', ...overrides };
}

function binding(overrides: Partial<RoleBindingModel>): RoleBindingModel {
  return {
    principal_type: 'user',
    principal_id: 'user-1',
    role: 'project_admin',
    scope_level: 'project',
    scope_id: 'proj-1',
    ...overrides,
  } as RoleBindingModel;
}

describe('mcpCallerHasPermission (KAN-76 act-tool authorization gate)', () => {
  beforeEach(() => {
    mockListRoleBindingsForUser.mockReset();
  });

  describe('api_key principal — checked against the key\'s own static scopes', () => {
    it('grants when the permission is in the key\'s scope list', async () => {
      await expect(mcpCallerHasPermission(apiKeyAuth(['mcp.read', 'dashboards.write']), 'dashboards.write')).resolves.toBe(true);
      expect(mockListRoleBindingsForUser).not.toHaveBeenCalled();
    });

    it('denies when the permission is absent from the key\'s scope list', async () => {
      await expect(mcpCallerHasPermission(apiKeyAuth(['mcp.read']), 'automation.approve')).resolves.toBe(false);
    });

    it('denies (never throws) when the key carries no scopes at all', async () => {
      await expect(mcpCallerHasPermission(apiKeyAuth(undefined), 'mcp.read')).resolves.toBe(false);
    });
  });

  describe('oauth principal — re-derived fresh from the granting human\'s current role bindings', () => {
    it('denies without ever querying role bindings when the auth context has no userId', async () => {
      await expect(mcpCallerHasPermission(oauthAuth({ userId: undefined }), 'dashboards.write')).resolves.toBe(false);
      expect(mockListRoleBindingsForUser).not.toHaveBeenCalled();
    });

    it('grants when a current role binding covers this project and its role has the permission', async () => {
      mockListRoleBindingsForUser.mockResolvedValue([binding({ role: 'project_admin', scope_level: 'project', scope_id: 'proj-1' })]);

      await expect(mcpCallerHasPermission(oauthAuth(), 'automation.approve')).resolves.toBe(true);
      expect(mockListRoleBindingsForUser).toHaveBeenCalledWith('user-1', ['org-1']);
    });

    it('denies when the bound role does not grant the permission — the privilege-escalation-prevention case', async () => {
      // `editor` has dashboards.write but neither automation.approve nor automation.execute (roles.ts).
      mockListRoleBindingsForUser.mockResolvedValue([binding({ role: 'editor', scope_level: 'project', scope_id: 'proj-1' })]);

      await expect(mcpCallerHasPermission(oauthAuth(), 'automation.approve')).resolves.toBe(false);
    });

    it('denies when the only binding is scoped to a different project (no sideways grant)', async () => {
      mockListRoleBindingsForUser.mockResolvedValue([binding({ role: 'project_admin', scope_level: 'project', scope_id: 'some-other-project' })]);

      await expect(mcpCallerHasPermission(oauthAuth(), 'automation.approve')).resolves.toBe(false);
    });

    it('denies by default when the user has no role bindings at all', async () => {
      mockListRoleBindingsForUser.mockResolvedValue([]);

      await expect(mcpCallerHasPermission(oauthAuth(), 'dashboards.write')).resolves.toBe(false);
    });
  });
});
