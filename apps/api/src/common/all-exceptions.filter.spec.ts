import { BadRequestException, HttpException, HttpStatus, NotFoundException, type ArgumentsHost } from '@nestjs/common';
import type { Logger } from '@growthos/shared';

const getActiveTraceId = jest.fn();
jest.mock('../instrumentation/telemetry', () => ({
  getActiveTraceId: () => getActiveTraceId(),
}));

const captureException = jest.fn();
jest.mock('../instrumentation/sentry', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

import { AllExceptionsFilter } from './all-exceptions.filter';

function mockLogger(): jest.Mocked<Pick<Logger, 'error'>> {
  return { error: jest.fn() };
}

function mockHost(request: { method: string; url: string }): {
  host: ArgumentsHost;
  json: jest.Mock;
  status: jest.Mock;
} {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, json, status };
}

describe('AllExceptionsFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getActiveTraceId.mockReturnValue('trace-123');
  });

  it('maps an HttpException to its status and response body', () => {
    const logger = mockLogger();
    const filter = new AllExceptionsFilter(logger as unknown as Logger);
    const { host, json, status } = mockHost({ method: 'GET', url: '/v1/health' });
    const exception = new HttpException('not found', HttpStatus.NOT_FOUND);

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'not found',
        traceId: 'trace-123',
        path: '/v1/health',
      }),
    );
  });

  it('flattens an object-shaped getResponse() instead of nesting it under message', () => {
    const logger = mockLogger();
    const filter = new AllExceptionsFilter(logger as unknown as Logger);
    const { host, json, status } = mockHost({ method: 'GET', url: '/v1/missing' });
    const exception = new NotFoundException();

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith({
      ...(exception.getResponse() as Record<string, unknown>),
      traceId: 'trace-123',
      timestamp: expect.any(String),
      path: '/v1/missing',
    });
  });

  it('preserves a validation error array from BadRequestException without double-nesting', () => {
    const logger = mockLogger();
    const filter = new AllExceptionsFilter(logger as unknown as Logger);
    const { host, json, status } = mockHost({ method: 'POST', url: '/v1/ingest' });
    const exception = new BadRequestException(['field is required']);

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    const [body] = json.mock.calls[0] as [{ message: unknown; statusCode: number }];
    expect(body.message).toEqual(['field is required']);
    expect(body.statusCode).toBe(HttpStatus.BAD_REQUEST);
  });

  it('maps a non-HTTP error to a 500 with a generic message', () => {
    const logger = mockLogger();
    const filter = new AllExceptionsFilter(logger as unknown as Logger);
    const { host, json, status } = mockHost({ method: 'POST', url: '/v1/ingest' });
    const exception = new Error('boom');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' }),
    );
  });

  it('logs the exception and reports it to Sentry tagged with the active trace id', () => {
    const logger = mockLogger();
    const filter = new AllExceptionsFilter(logger as unknown as Logger);
    const { host } = mockHost({ method: 'GET', url: '/v1/health' });
    const exception = new Error('boom');

    filter.catch(exception, host);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: exception, traceId: 'trace-123', method: 'GET', path: '/v1/health' }),
      'Unhandled exception',
    );
    expect(captureException).toHaveBeenCalledWith(exception, { traceId: 'trace-123' });
  });
});
