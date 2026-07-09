import { afterEach, describe, expect, it } from 'vitest';
import { ingestApiUrl } from './ingest-api-url';

describe('ingestApiUrl', () => {
  const original = process.env.NEXT_PUBLIC_INGEST_API_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_INGEST_API_URL = original;
  });

  it('falls back to a local-dev default when unset', () => {
    delete process.env.NEXT_PUBLIC_INGEST_API_URL;
    expect(ingestApiUrl()).toBe('http://localhost:3001/v1/ingest');
  });

  it('uses the configured value when set', () => {
    process.env.NEXT_PUBLIC_INGEST_API_URL = 'https://api.example.com/v1/ingest';
    expect(ingestApiUrl()).toBe('https://api.example.com/v1/ingest');
  });
});
