import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  EnvironmentModel,
  MembershipModel,
  OrganizationModel,
  ProjectModel,
  RoleBindingModel,
  ServiceAccountModel,
  UserModel,
  removeMembershipCascade,
} from './index';
import { connectToFirestoreEmulator } from './test-utils/emulator';

/**
 * CRUD/cascade tests against the real Firestore emulator (KAN-22 AC), as
 * opposed to `models.test.ts` which only exercises field/path metadata
 * against a stubbed connection. Run via `pnpm test` in this package, which
 * wraps vitest in `firebase emulators:exec` (see package.json + firebase.json).
 */

beforeAll(async () => {
  await connectToFirestoreEmulator('models-emulator-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

describe('firebase-orm models against the Firestore emulator', () => {
  it('creates, loads, updates and deletes documents across the model hierarchy', async () => {
    const org = new OrganizationModel();
    org.name = 'Acme Inc';
    org.slug = unique('acme');
    await org.save();
    expect(org.id).toBeTruthy();

    const loadedOrg = await OrganizationModel.init(org.id);
    expect(loadedOrg?.name).toBe('Acme Inc');

    const project = new ProjectModel();
    project.name = 'Website';
    project.organization_id = org.id;
    await project.save();

    const loadedProject = await ProjectModel.init(project.id, { organization_id: org.id });
    expect(loadedProject?.name).toBe('Website');

    const environment = new EnvironmentModel();
    environment.name = 'production';
    environment.project_id = project.id;
    environment.setPathParams({ organization_id: org.id, project_id: project.id });
    await environment.save();

    const loadedEnv = await EnvironmentModel.init(environment.id, {
      organization_id: org.id,
      project_id: project.id,
    });
    expect(loadedEnv?.name).toBe('production');

    const serviceAccount = new ServiceAccountModel();
    serviceAccount.name = 'ingest-bot';
    serviceAccount.project_id = project.id;
    serviceAccount.is_active = true;
    serviceAccount.setPathParams({ organization_id: org.id, project_id: project.id });
    await serviceAccount.save();

    const loadedServiceAccount = await ServiceAccountModel.init(serviceAccount.id, {
      organization_id: org.id,
      project_id: project.id,
    });
    expect(loadedServiceAccount?.is_active).toBe(true);

    // Update
    loadedOrg!.billing_email = 'billing@acme.example.com';
    await loadedOrg!.save();
    const reloadedOrg = await OrganizationModel.init(org.id);
    expect(reloadedOrg?.billing_email).toBe('billing@acme.example.com');

    loadedProject!.vertical = 'marketing';
    await loadedProject!.save();
    const reloadedProject = await ProjectModel.init(project.id, { organization_id: org.id });
    expect(reloadedProject?.vertical).toBe('marketing');

    loadedServiceAccount!.is_active = false;
    await loadedServiceAccount!.save();
    const reloadedServiceAccount = await ServiceAccountModel.init(serviceAccount.id, {
      organization_id: org.id,
      project_id: project.id,
    });
    expect(reloadedServiceAccount?.is_active).toBe(false);

    // Delete
    await reloadedServiceAccount!.remove();
    const afterServiceAccountDelete = await ServiceAccountModel.init(serviceAccount.id, {
      organization_id: org.id,
      project_id: project.id,
    });
    expect(afterServiceAccountDelete).toBeNull();

    await loadedEnv!.remove();
    const afterEnvDelete = await EnvironmentModel.init(environment.id, {
      organization_id: org.id,
      project_id: project.id,
    });
    expect(afterEnvDelete).toBeNull();

    await reloadedProject!.remove();
    const afterProjectDelete = await ProjectModel.init(project.id, { organization_id: org.id });
    expect(afterProjectDelete).toBeNull();

    await reloadedOrg!.remove();
    const afterOrgDelete = await OrganizationModel.init(org.id);
    expect(afterOrgDelete).toBeNull();
  });

  it('creates, updates and deletes a membership and a role binding directly', async () => {
    const org = new OrganizationModel();
    org.name = 'Direct CRUD Org';
    await org.save();

    const user = new UserModel();
    user.email = `${unique('direct')}@example.com`;
    await user.save();

    const membership = new MembershipModel();
    membership.user_id = user.id;
    membership.organization_id = org.id;
    membership.role = 'viewer';
    await membership.save();

    const loadedMembership = await MembershipModel.init(membership.id, {
      organization_id: org.id,
    });
    expect(loadedMembership?.role).toBe('viewer');

    loadedMembership!.role = 'editor';
    await loadedMembership!.save();
    const reloadedMembership = await MembershipModel.init(membership.id, {
      organization_id: org.id,
    });
    expect(reloadedMembership?.role).toBe('editor');

    const binding = new RoleBindingModel();
    binding.principal_type = 'user';
    binding.principal_id = user.id;
    binding.role = 'editor';
    binding.scope_level = 'org';
    binding.scope_id = org.id;
    binding.setPathParams({ organization_id: org.id });
    await binding.save();

    const loadedBinding = await RoleBindingModel.init(binding.id, { organization_id: org.id });
    expect(loadedBinding?.role).toBe('editor');

    loadedBinding!.role = 'viewer';
    await loadedBinding!.save();
    const reloadedBinding = await RoleBindingModel.init(binding.id, { organization_id: org.id });
    expect(reloadedBinding?.role).toBe('viewer');

    await reloadedBinding!.remove();
    const afterBindingDelete = await RoleBindingModel.init(binding.id, { organization_id: org.id });
    expect(afterBindingDelete).toBeNull();

    await reloadedMembership!.remove();
    const afterMembershipDelete = await MembershipModel.init(membership.id, {
      organization_id: org.id,
    });
    expect(afterMembershipDelete).toBeNull();
  });

  it('keeps one user active in two orgs with different roles', async () => {
    const user = new UserModel();
    user.email = `${unique('ada')}@example.com`;
    await user.save();

    const orgA = new OrganizationModel();
    orgA.name = 'Org A';
    await orgA.save();

    const orgB = new OrganizationModel();
    orgB.name = 'Org B';
    await orgB.save();

    const membershipA = new MembershipModel();
    membershipA.user_id = user.id;
    membershipA.organization_id = orgA.id;
    membershipA.role = 'org_admin';
    await membershipA.save();

    const membershipB = new MembershipModel();
    membershipB.user_id = user.id;
    membershipB.organization_id = orgB.id;
    membershipB.role = 'viewer';
    await membershipB.save();

    const membershipsInA = await MembershipModel.initPath({ organization_id: orgA.id }).getAll([
      ['user_id', '==', user.id],
    ]);
    const membershipsInB = await MembershipModel.initPath({ organization_id: orgB.id }).getAll([
      ['user_id', '==', user.id],
    ]);

    expect(membershipsInA).toHaveLength(1);
    expect(membershipsInA[0].role).toBe('org_admin');
    expect(membershipsInB).toHaveLength(1);
    expect(membershipsInB[0].role).toBe('viewer');
  });

  it('cascades role-binding removal when a membership is removed', async () => {
    const org = new OrganizationModel();
    org.name = 'Cascade Org';
    await org.save();

    const user = new UserModel();
    user.email = `${unique('cascade-user')}@example.com`;
    await user.save();

    const otherUser = new UserModel();
    otherUser.email = `${unique('other-user')}@example.com`;
    await otherUser.save();

    const project = new ProjectModel();
    project.name = 'Cascade Project';
    project.organization_id = org.id;
    await project.save();

    const membership = new MembershipModel();
    membership.user_id = user.id;
    membership.organization_id = org.id;
    membership.role = 'project_admin';
    await membership.save();

    const orgBinding = new RoleBindingModel();
    orgBinding.principal_type = 'user';
    orgBinding.principal_id = user.id;
    orgBinding.role = 'org_admin';
    orgBinding.scope_level = 'org';
    orgBinding.scope_id = org.id;
    orgBinding.setPathParams({ organization_id: org.id });
    await orgBinding.save();

    const projectBinding = new RoleBindingModel();
    projectBinding.principal_type = 'user';
    projectBinding.principal_id = user.id;
    projectBinding.role = 'project_admin';
    projectBinding.scope_level = 'project';
    projectBinding.scope_id = project.id;
    projectBinding.setPathParams({ organization_id: org.id });
    await projectBinding.save();

    // A binding for a different user in the same org must survive the cascade.
    const untouchedBinding = new RoleBindingModel();
    untouchedBinding.principal_type = 'user';
    untouchedBinding.principal_id = otherUser.id;
    untouchedBinding.role = 'viewer';
    untouchedBinding.scope_level = 'org';
    untouchedBinding.scope_id = org.id;
    untouchedBinding.setPathParams({ organization_id: org.id });
    await untouchedBinding.save();

    await removeMembershipCascade(membership);

    const remainingMembership = await MembershipModel.init(membership.id, {
      organization_id: org.id,
    });
    expect(remainingMembership).toBeNull();

    const remainingBindingsForUser = await RoleBindingModel.initPath({
      organization_id: org.id,
    })
      .where('principal_id', '==', user.id)
      .get();
    expect(remainingBindingsForUser).toHaveLength(0);

    const survivingBinding = await RoleBindingModel.init(untouchedBinding.id, {
      organization_id: org.id,
    });
    expect(survivingBinding).not.toBeNull();
    expect(survivingBinding?.principal_id).toBe(otherUser.id);
  });
});
