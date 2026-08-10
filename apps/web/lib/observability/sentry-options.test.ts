import { afterEach, describe, expect, it } from 'vitest';
import { sentryOptions } from './sentry-options';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('sentryOptions', () => {
  it('disables tracing and has no dsn when NEXT_PUBLIC_SENTRY_DSN is unset', () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    const options = sentryOptions('server');
    expect(options.dsn).toBeUndefined();
    expect(options.tracesSampleRate).toBe(0);
  });

  it('enables full tracing once a dsn is configured', () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';
    const options = sentryOptions('client');
    expect(options.dsn).toBe('https://public@example.ingest.sentry.io/1');
    expect(options.tracesSampleRate).toBe(1);
  });

  it('tags the runtime that produced the event', () => {
    expect(sentryOptions('server').initialScope.tags.runtime).toBe('server');
    expect(sentryOptions('edge').initialScope.tags.runtime).toBe('edge');
    expect(sentryOptions('client').initialScope.tags.runtime).toBe('client');
  });

  it('defaults the environment to dev', () => {
    delete process.env.NEXT_PUBLIC_GROWTHOS_ENV;
    expect(sentryOptions('server').environment).toBe('dev');
  });
});
