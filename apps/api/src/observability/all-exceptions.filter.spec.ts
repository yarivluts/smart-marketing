import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function createMockHost(): { host: ArgumentsHost; response: { status: jest.Mock; json: jest.Mock } } {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({}),
    }),
  } as unknown as ArgumentsHost;

  return { host, response };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  it('maps an HttpException to its own status and message', () => {
    const { host, response } = createMockHost();
    const exception = new HttpException('not allowed', HttpStatus.FORBIDDEN);

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatus.FORBIDDEN, message: 'not allowed' }),
    );
  });

  it('maps an unknown error to a 500 with a generic message', () => {
    const { host, response } = createMockHost();

    filter.catch(new Error('boom'), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' }),
    );
  });

  it('includes a traceId field in the response body', () => {
    const { host, response } = createMockHost();

    filter.catch(new Error('boom'), host);

    const [body] = response.json.mock.calls[0];
    expect(body).toHaveProperty('traceId');
  });
});
