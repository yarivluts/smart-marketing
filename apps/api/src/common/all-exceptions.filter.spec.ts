jest.mock('@sentry/nestjs', () => ({
  SentryExceptionCaptured: () => (): void => {
    // no-op in tests: the real decorator would forward to Sentry.captureException
  },
}));

import { HttpException, HttpStatus, type ArgumentsHost } from '@nestjs/common';
import { runWithTraceId } from '@growthos/shared';
import { AllExceptionsFilter } from './all-exceptions.filter';

function buildHost(request: { method: string; url: string }, response: { json: jest.Mock }) {
  const status = jest.fn().mockReturnValue(response);
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, status };
}

describe('AllExceptionsFilter', () => {
  it('maps an HttpException to its own status/message and includes the trace id', () => {
    const filter = new AllExceptionsFilter();
    const json = jest.fn();
    const { host, status } = buildHost({ method: 'GET', url: '/v1/health' }, { json });

    runWithTraceId('trace-1', () => {
      filter.catch(new HttpException('nope', HttpStatus.BAD_REQUEST), host);
    });

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'nope',
      traceId: 'trace-1',
    });
  });

  it('maps an unknown thrown value to a 500 with a generic message', () => {
    const filter = new AllExceptionsFilter();
    const json = jest.fn();
    const { host, status } = buildHost({ method: 'POST', url: '/v1/ingest' }, { json });

    runWithTraceId('trace-2', () => {
      filter.catch(new Error('boom'), host);
    });

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      traceId: 'trace-2',
    });
  });

  it('omits traceId when called outside of a request trace context', () => {
    const filter = new AllExceptionsFilter();
    const json = jest.fn();
    const { host } = buildHost({ method: 'GET', url: '/v1/health' }, { json });

    filter.catch(new Error('boom'), host);

    expect(json).toHaveBeenCalledWith(expect.objectContaining({ traceId: undefined }));
  });
});
