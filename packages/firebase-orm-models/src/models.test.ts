import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import { FirestoreOrmRepository } from '@arbel/firebase-orm';
import {
  UserModel,
  OrganizationModel,
  MembershipModel,
  RoleBindingModel,
  isRole,
} from './index';

beforeAll(() => {
  // Stub the global connection so BaseModel's constructor does not require a
  // live Firestore. These unit tests exercise field/path metadata only; CRUD
  // against the Firestore emulator arrives with KAN-22.
  const repo = FirestoreOrmRepository as unknown as {
    globalFirestores: Record<string, unknown>;
    DEFAULT_KEY_NAME: string;
  };
  repo.globalFirestores[repo.DEFAULT_KEY_NAME] = {};
});

describe('firebase-orm models', () => {
  it('stores fields on UserModel and exposes them back', () => {
    const user = new UserModel();
    user.email = 'ada@example.com';
    user.display_name = 'Ada';
    expect(user.email).toBe('ada@example.com');
    expect(user.getData()).toMatchObject({ email: 'ada@example.com', display_name: 'Ada' });
  });

  it('honours field_name aliases', () => {
    const user = new UserModel();
    user.firebaseUid = 'uid-123';
    expect(user.getData()).toMatchObject({ firebase_uid: 'uid-123' });
  });

  it('exposes the reference path for each model in the hierarchy', () => {
    expect(new UserModel().getReferencePath()).toBe('users');
    expect(new OrganizationModel().getReferencePath()).toBe('organizations');
    expect(new MembershipModel().getReferencePath()).toBe(
      'organizations/:organization_id/memberships',
    );
    expect(new RoleBindingModel().getReferencePath()).toBe(
      'organizations/:organization_id/role_bindings',
    );
  });

  it('validates roles', () => {
    expect(isRole('owner')).toBe(true);
    expect(isRole('superuser')).toBe(false);
  });
});
