import { describe, expect, it } from 'vitest';
import { can, evaluate, type PolicyBinding, type ResourceScope } from './engine';
import { PERMISSIONS, type Permission } from './permissions';
import { INVITABLE_ROLES, ROLES, ROLE_PERMISSIONS, ROLE_SCOPE_LEVELS, type Role } from './roles';
import { isScopeLevel, SCOPE_LEVELS } from './scopes';
import { isRole } from './roles';
import { isPermission } from './permissions';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const PROJECT = 'project-1';
const OTHER_PROJECT = 'project-2';
const ENV = 'env-1';
const OTHER_ENV = 'env-2';

const USER = { type: 'user' as const, id: 'user-1' };

function bindingAt(role: Role, scopeLevel: PolicyBinding['scopeLevel'], scopeId: string): PolicyBinding {
  return { principalType: USER.type, principalId: USER.id, role, scopeLevel, scopeId };
}

const RESOURCE_BY_LEVEL: Record<'org' | 'project' | 'environment', ResourceScope> = {
  org: { orgId: ORG },
  project: { orgId: ORG, projectId: PROJECT },
  environment: { orgId: ORG, projectId: PROJECT, environmentId: ENV },
};

describe('permission catalog and role bundles', () => {
  it('every role bundle only draws from the permission catalog', () => {
    for (const role of ROLES) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(PERMISSIONS).toContain(permission);
      }
    }
  });

  it('validates roles, permissions, and scope levels', () => {
    expect(isRole('project_admin')).toBe(true);
    expect(isRole('superuser')).toBe(false);
    expect(isPermission('metrics.write')).toBe(true);
    expect(isPermission('metrics.delete')).toBe(false);
    expect(isScopeLevel('project')).toBe(true);
    expect(isScopeLevel('object')).toBe(false);
  });

  it('never makes a role invitable at org scope unless it is meant to be bound at org scope, and never invites org_owner/platform_admin (KAN-25)', () => {
    // Pins the rule INVITABLE_ROLES' own doc comment states, so adding a new
    // role can't silently drift the two out of sync (the exact bug the KAN-25
    // review caught for `project_admin`, whose typical scope is `project` —
    // inviting it at org scope would hand out org-wide access under a
    // narrower-sounding role name).
    for (const role of ROLES) {
      const invitable = (INVITABLE_ROLES as readonly Role[]).includes(role);
      if (role === 'org_owner' || role === 'platform_admin') {
        expect(invitable).toBe(false);
        continue;
      }
      expect(invitable).toBe(ROLE_SCOPE_LEVELS[role].includes('org'));
    }
  });
});

describe('deny-by-default', () => {
  it('denies when there are no bindings at all', () => {
    expect(can([], USER, 'metrics.write', RESOURCE_BY_LEVEL.project)).toBe(false);
  });

  it('denies a principal with no matching bindings', () => {
    const bindings = [bindingAt('org_owner', 'org', OTHER_ORG)];
    expect(can(bindings, USER, 'metrics.write', RESOURCE_BY_LEVEL.project)).toBe(false);
  });

  it('denies a different principal even with a covering binding', () => {
    const bindings = [bindingAt('org_owner', 'org', ORG)];
    const decision = evaluate(bindings, { type: 'user', id: 'someone-else' }, 'metrics.write', RESOURCE_BY_LEVEL.project);
    expect(decision.allowed).toBe(false);
  });
});

describe('table-driven: (role x permission x level) -> allow/deny at self-scope', () => {
  const cases: Array<[Role, PolicyBinding['scopeLevel'], keyof typeof RESOURCE_BY_LEVEL | 'platform']> = [
    ['platform_admin', 'platform', 'org'],
    ['org_owner', 'org', 'org'],
    ['org_admin', 'org', 'org'],
    ['project_admin', 'project', 'project'],
    ['editor', 'project', 'project'],
    ['operator', 'project', 'project'],
    ['viewer', 'project', 'project'],
    ['ingest_only', 'environment', 'environment'],
  ];

  for (const [role, scopeLevel, resourceLevel] of cases) {
    for (const permission of PERMISSIONS) {
      const expected = ROLE_PERMISSIONS[role].includes(permission);

      it(`${role} bound at ${scopeLevel} ${expected ? 'is allowed' : 'is denied'} ${permission}`, () => {
        const scopeId = { platform: 'platform', org: ORG, project: PROJECT, environment: ENV }[scopeLevel];
        const bindings = [bindingAt(role, scopeLevel, scopeId)];
        expect(can(bindings, USER, permission, RESOURCE_BY_LEVEL[resourceLevel])).toBe(expected);
      });
    }
  }
});

describe('inheritance down the org -> project -> environment hierarchy', () => {
  it('an org-level binding covers project-level and environment-level resources in that org', () => {
    const bindings = [bindingAt('project_admin', 'org', ORG)];
    expect(can(bindings, USER, 'schema.write', RESOURCE_BY_LEVEL.project)).toBe(true);
    expect(can(bindings, USER, 'schema.write', RESOURCE_BY_LEVEL.environment)).toBe(true);
  });

  it('an org-level binding does not cover a different org', () => {
    const bindings = [bindingAt('org_owner', 'org', ORG)];
    expect(can(bindings, USER, 'project.manage', { orgId: OTHER_ORG })).toBe(false);
  });

  it('a project-level binding covers every environment under that project', () => {
    const bindings = [bindingAt('project_admin', 'project', PROJECT)];
    expect(can(bindings, USER, 'schema.write', { orgId: ORG, projectId: PROJECT, environmentId: ENV })).toBe(true);
    expect(
      can(bindings, USER, 'schema.write', { orgId: ORG, projectId: PROJECT, environmentId: OTHER_ENV }),
    ).toBe(true);
  });

  it('a project-level binding does not cover a sibling project or the parent org', () => {
    const bindings = [bindingAt('project_admin', 'project', PROJECT)];
    expect(can(bindings, USER, 'schema.write', { orgId: ORG, projectId: OTHER_PROJECT })).toBe(false);
    expect(can(bindings, USER, 'schema.write', RESOURCE_BY_LEVEL.org)).toBe(false);
  });

  it('an environment-level binding does not cover a sibling environment or its parent project', () => {
    const bindings = [bindingAt('ingest_only', 'environment', ENV)];
    expect(can(bindings, USER, 'ingest.write', { orgId: ORG, projectId: PROJECT, environmentId: OTHER_ENV })).toBe(
      false,
    );
    expect(can(bindings, USER, 'ingest.write', RESOURCE_BY_LEVEL.project)).toBe(false);
  });

  it('a platform-level binding covers every org, project, and environment', () => {
    const bindings = [bindingAt('platform_admin', 'platform', 'platform')];
    for (const permission of PERMISSIONS) {
      expect(can(bindings, USER, permission, RESOURCE_BY_LEVEL.org)).toBe(true);
      expect(can(bindings, USER, permission, RESOURCE_BY_LEVEL.project)).toBe(true);
      expect(can(bindings, USER, permission, RESOURCE_BY_LEVEL.environment)).toBe(true);
    }
  });
});

describe('the PII gate is a separate grant', () => {
  it('project_admin does not get pii.read for free', () => {
    const bindings = [bindingAt('project_admin', 'project', PROJECT)];
    expect(can(bindings, USER, 'pii.read', RESOURCE_BY_LEVEL.project)).toBe(false);
  });

  it('org_owner and platform_admin do carry pii.read', () => {
    expect(can([bindingAt('org_owner', 'org', ORG)], USER, 'pii.read', RESOURCE_BY_LEVEL.project)).toBe(true);
    expect(
      can([bindingAt('platform_admin', 'platform', 'platform')], USER, 'pii.read', RESOURCE_BY_LEVEL.org),
    ).toBe(true);
  });
});

describe('multiple bindings union, and are scoped independently', () => {
  it('a viewer-at-org plus operator-at-one-project grants automation only in that project', () => {
    const bindings = [bindingAt('viewer', 'org', ORG), bindingAt('operator', 'project', PROJECT)];
    expect(can(bindings, USER, 'automation.execute', RESOURCE_BY_LEVEL.project)).toBe(true);
    expect(can(bindings, USER, 'automation.execute', { orgId: ORG, projectId: OTHER_PROJECT })).toBe(false);
    expect(can(bindings, USER, 'automation.execute', RESOURCE_BY_LEVEL.org)).toBe(false);
  });
});

describe('service account principals', () => {
  it('an ingest-only service account can push data but nothing else', () => {
    const bindings: PolicyBinding[] = [
      { principalType: 'service_account', principalId: 'svc-1', role: 'ingest_only', scopeLevel: 'environment', scopeId: ENV },
    ];
    const svc = { type: 'service_account' as const, id: 'svc-1' };
    expect(can(bindings, svc, 'ingest.write', RESOURCE_BY_LEVEL.environment)).toBe(true);
    expect(can(bindings, svc, 'schema.write', RESOURCE_BY_LEVEL.environment)).toBe(false);
  });

  it('a user binding does not leak permissions to a service account with the same id', () => {
    const bindings = [bindingAt('org_owner', 'org', ORG)];
    const svc = { type: 'service_account' as const, id: USER.id };
    expect(can(bindings, svc, 'project.manage', RESOURCE_BY_LEVEL.org)).toBe(false);
  });
});

it('evaluate() explains an allow and a deny', () => {
  const bindings = [bindingAt('editor', 'project', PROJECT)];
  const allowed = evaluate(bindings, USER, 'metrics.write' as Permission, RESOURCE_BY_LEVEL.project);
  expect(allowed.allowed).toBe(true);
  expect(allowed.reason).toContain('editor');

  const denied = evaluate(bindings, USER, 'keys.manage' as Permission, RESOURCE_BY_LEVEL.project);
  expect(denied.allowed).toBe(false);
  expect(denied.reason).toContain('deny-by-default');
});

it('exports the scope level list used to describe the hierarchy', () => {
  expect(SCOPE_LEVELS).toEqual(['platform', 'org', 'project', 'environment']);
});
