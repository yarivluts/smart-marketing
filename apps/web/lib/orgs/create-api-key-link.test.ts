import { describe, expect, it } from 'vitest';
import { createApiKeyHref, parseCreateApiKeyPreset } from './create-api-key-link';

describe('createApiKeyHref', () => {
  it('links to the create form with a browser key preselected for the environment', () => {
    expect(createApiKeyHref('/orgs/o/projects/p/keys', 'publishable', 'env-prod')).toBe(
      '/orgs/o/projects/p/keys?kind=publishable&environmentId=env-prod#create-key',
    );
  });

  it('asks for ingest.write on a server key, and drops a missing environment', () => {
    expect(createApiKeyHref('/k', 'secret', null)).toBe(
      '/k?kind=secret&scopes=ingest.write#create-key',
    );
  });
});

describe('parseCreateApiKeyPreset', () => {
  it('round-trips what createApiKeyHref writes', () => {
    const href = createApiKeyHref('/k', 'secret', 'env-1');
    const query = Object.fromEntries(new URL(href, 'https://x.test').searchParams);
    expect(parseCreateApiKeyPreset(query)).toEqual({
      kind: 'secret',
      environmentId: 'env-1',
      scopes: ['ingest.write'],
    });
  });

  it('ignores unknown kinds and scopes, and empty values', () => {
    expect(
      parseCreateApiKeyPreset({ kind: 'admin', scopes: 'root,ingest.write', environmentId: ' ' }),
    ).toEqual({ scopes: ['ingest.write'] });
    expect(parseCreateApiKeyPreset({})).toEqual({});
  });

  it('takes the first value of a repeated parameter', () => {
    expect(parseCreateApiKeyPreset({ kind: ['publishable', 'secret'] })).toEqual({
      kind: 'publishable',
    });
  });
});
