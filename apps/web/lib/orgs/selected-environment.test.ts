import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOrganizationWithOwner, createProject, ensureUserForFirebaseSession } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { resolveSelectedEnvironment } from './selected-environment';

const { requestCookies } = vi.hoisted(() => ({ requestCookies: new Map<string, string>() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (requestCookies.has(name) ? { name, value: requestCookies.get(name)! } : undefined),
  }),
}));

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await ensureFirestoreOrm();
});

beforeEach(() => {
  requestCookies.clear();
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function setupProject(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const byName = (name: string) => environments.find((environment) => environment.name === name)!;
  return { organization, project, dev: byName('dev'), prod: byName('prod') };
}

describe('resolveSelectedEnvironment', () => {
  it('resolves the project\'s prod environment when no cookie is set, alongside every environment', async () => {
    const { organization, project, prod } = await setupProject('Selected Env Default Org');

    const { selected, environments } = await resolveSelectedEnvironment(organization.id, project.id);

    expect(selected?.id).toBe(prod.id);
    expect(environments.map((environment) => environment.name).sort()).toEqual(['dev', 'prod', 'staging']);
  });

  it('resolves the environment the project\'s own cookie names', async () => {
    const { organization, project, dev } = await setupProject('Selected Env Cookie Org');
    requestCookies.set(`gos_env_${project.id}`, 'dev');

    const { selected } = await resolveSelectedEnvironment(organization.id, project.id);

    expect(selected?.id).toBe(dev.id);
  });

  it('ignores another project\'s cookie and an invalid value, falling back to prod', async () => {
    const { organization, project, prod } = await setupProject('Selected Env Other Cookie Org');
    requestCookies.set('gos_env_some-other-project', 'dev');
    expect((await resolveSelectedEnvironment(organization.id, project.id)).selected?.id).toBe(prod.id);

    requestCookies.set(`gos_env_${project.id}`, 'not-an-environment');
    expect((await resolveSelectedEnvironment(organization.id, project.id)).selected?.id).toBe(prod.id);
  });
});
