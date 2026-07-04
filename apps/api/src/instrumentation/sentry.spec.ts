const init = jest.fn();
const captureExceptionMock = jest.fn();
const withScope = jest.fn((callback: (scope: { setTag: jest.Mock }) => void) => {
  callback({ setTag: jest.fn() });
});

jest.mock('@sentry/node', () => ({
  init,
  captureException: captureExceptionMock,
  withScope,
}));

import { captureException, initSentry, isSentryEnabled } from './sentry';

describe('sentry instrumentation', () => {
  const previousDsn = process.env.SENTRY_DSN;

  afterEach(() => {
    if (previousDsn === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = previousDsn;
    jest.clearAllMocks();
  });

  describe('initSentry', () => {
    it('is a no-op when SENTRY_DSN is unset', () => {
      delete process.env.SENTRY_DSN;

      expect(initSentry()).toBe(false);
      expect(init).not.toHaveBeenCalled();
    });

    it('initializes Sentry when SENTRY_DSN is set', () => {
      process.env.SENTRY_DSN = 'https://example@sentry.io/1';

      expect(initSentry({ environment: 'staging', release: '1.2.3' })).toBe(true);
      expect(init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://example@sentry.io/1',
          environment: 'staging',
          release: '1.2.3',
        }),
      );
    });
  });

  describe('isSentryEnabled', () => {
    it('reflects whether SENTRY_DSN is set', () => {
      delete process.env.SENTRY_DSN;
      expect(isSentryEnabled()).toBe(false);

      process.env.SENTRY_DSN = 'https://example@sentry.io/1';
      expect(isSentryEnabled()).toBe(true);
    });
  });

  describe('captureException', () => {
    it('does not report to Sentry when disabled', () => {
      delete process.env.SENTRY_DSN;

      captureException(new Error('boom'), { traceId: 'abc' });

      expect(withScope).not.toHaveBeenCalled();
      expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it('tags the event with the trace id and reports it when enabled', () => {
      process.env.SENTRY_DSN = 'https://example@sentry.io/1';
      const error = new Error('boom');

      captureException(error, { traceId: 'trace-123' });

      expect(withScope).toHaveBeenCalledTimes(1);
      expect(captureExceptionMock).toHaveBeenCalledWith(error);
    });
  });
});
