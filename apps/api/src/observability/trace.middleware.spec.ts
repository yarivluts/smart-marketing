jest.mock('@sentry/nestjs', () => ({
  getCurrentScope: jest.fn(),
}));

import { getTraceId } from '@growthos/shared';
import * as Sentry from '@sentry/nestjs';
import { TraceMiddleware } from './trace.middleware';

describe('TraceMiddleware', () => {
  function setup(headerValue: string | undefined) {
    const setTag = jest.fn();
    (Sentry.getCurrentScope as jest.Mock).mockReturnValue({ setTag });
    const req = { header: jest.fn().mockReturnValue(headerValue) };
    const res = { setHeader: jest.fn() };
    return { req, res, setTag };
  }

  it('generates a trace id when no x-request-id header is present', () => {
    const { req, res, setTag } = setup(undefined);
    const middleware = new TraceMiddleware();
    let observedInsideNext: string | undefined;

    middleware.use(req as never, res as never, () => {
      observedInsideNext = getTraceId();
    });

    expect(observedInsideNext).toMatch(/^[0-9a-f]{32}$/);
    expect(res.setHeader).toHaveBeenCalledWith('x-trace-id', observedInsideNext);
    expect(setTag).toHaveBeenCalledWith('trace_id', observedInsideNext);
  });

  it('reuses an incoming x-request-id as the trace id', () => {
    const { req, res, setTag } = setup('incoming-request-id');
    const middleware = new TraceMiddleware();
    let observedInsideNext: string | undefined;

    middleware.use(req as never, res as never, () => {
      observedInsideNext = getTraceId();
    });

    expect(observedInsideNext).toBe('incoming-request-id');
    expect(res.setHeader).toHaveBeenCalledWith('x-trace-id', 'incoming-request-id');
    expect(setTag).toHaveBeenCalledWith('trace_id', 'incoming-request-id');
  });

  it('does not leak the trace id outside of the request', () => {
    const { req, res } = setup(undefined);
    const middleware = new TraceMiddleware();

    middleware.use(req as never, res as never, () => undefined);

    expect(getTraceId()).toBeUndefined();
  });
});
