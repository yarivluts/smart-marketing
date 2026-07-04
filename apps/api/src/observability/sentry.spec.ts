jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  withScope: jest.fn((callback: (scope: { setTag: jest.Mock }) => void) => callback({ setTag: jest.fn() })),
  captureException: jest.fn(),
}));

import * as Sentry from '@sentry/node';
import { captureExceptionWithTrace, initSentry, isSentryEnabled, resetSentryForTests } from './sentry';

describe('sentry', () => {
  const originalDsn = process.env.SENTRY_DSN;

  afterEach(() => {
    jest.clearAllMocks();
    resetSentryForTests();
    if (originalDsn === undefined) {
      delete process.env.SENTRY_DSN;
    } else {
      process.env.SENTRY_DSN = originalDsn;
    }
  });

  it('does not initialize Sentry when SENTRY_DSN is unset', () => {
    delete process.env.SENTRY_DSN;

    initSentry();

    expect(Sentry.init).not.toHaveBeenCalled();
    expect(isSentryEnabled()).toBe(false);
  });

  it('initializes Sentry once when SENTRY_DSN is configured', () => {
    process.env.SENTRY_DSN = 'https://example@sentry.example.com/1';

    initSentry();
    initSentry();

    expect(Sentry.init).toHaveBeenCalledTimes(1);
    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: process.env.SENTRY_DSN }));
    expect(isSentryEnabled()).toBe(true);
  });

  it('does not report to Sentry when disabled, but still returns the trace id', () => {
    delete process.env.SENTRY_DSN;

    const traceId = captureExceptionWithTrace(new Error('boom'));

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(traceId).toBeUndefined();
  });

  it('reports to Sentry and tags the trace id when enabled', () => {
    process.env.SENTRY_DSN = 'https://example@sentry.example.com/1';
    initSentry();

    const error = new Error('boom');
    captureExceptionWithTrace(error);

    expect(Sentry.withScope).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });
});
