import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SELECTED_ENVIRONMENT,
  ENVIRONMENT_COOKIE_MAX_AGE_SECONDS,
  environmentCookieName,
  pickSelectedEnvironment,
  serializeEnvironmentCookie,
} from './environment-selection';

const dev = { id: 'env-dev', name: 'dev' };
const staging = { id: 'env-staging', name: 'staging' };
const prod = { id: 'env-prod', name: 'prod' };
const all = [dev, staging, prod];

describe('pickSelectedEnvironment', () => {
  it('returns the environment the cookie names when the project has it', () => {
    expect(pickSelectedEnvironment(all, 'dev')).toBe(dev);
    expect(pickSelectedEnvironment(all, 'staging')).toBe(staging);
    expect(pickSelectedEnvironment(all, 'prod')).toBe(prod);
  });

  it('falls back to prod when the cookie is missing', () => {
    expect(DEFAULT_SELECTED_ENVIRONMENT).toBe('prod');
    expect(pickSelectedEnvironment(all, undefined)).toBe(prod);
  });

  it('falls back to prod when the cookie holds something that is not an environment name', () => {
    expect(pickSelectedEnvironment(all, '')).toBe(prod);
    expect(pickSelectedEnvironment(all, 'production')).toBe(prod);
    expect(pickSelectedEnvironment(all, 'env-dev')).toBe(prod);
    expect(pickSelectedEnvironment(all, 'DEV')).toBe(prod);
  });

  it('falls back to prod when the cookie names an environment this project does not have', () => {
    expect(pickSelectedEnvironment([dev, prod], 'staging')).toBe(prod);
  });

  it('falls back to the first environment when the project has no prod', () => {
    expect(pickSelectedEnvironment([staging, dev], undefined)).toBe(staging);
    expect(pickSelectedEnvironment([staging, dev], 'dev')).toBe(dev);
  });

  it('returns null for a project with no environments at all', () => {
    expect(pickSelectedEnvironment([], 'dev')).toBeNull();
    expect(pickSelectedEnvironment([], undefined)).toBeNull();
  });
});

describe('environment cookie', () => {
  it('is named per project', () => {
    expect(environmentCookieName('proj-1')).toBe('gos_env_proj-1');
    expect(environmentCookieName('proj-2')).not.toBe(environmentCookieName('proj-1'));
  });

  it('serializes a site-wide, SameSite=Lax, one-year cookie holding the environment name', () => {
    expect(ENVIRONMENT_COOKIE_MAX_AGE_SECONDS).toBe(31_536_000);
    expect(serializeEnvironmentCookie('proj-1', 'dev')).toBe('gos_env_proj-1=dev; Path=/; Max-Age=31536000; SameSite=Lax');
  });
});
