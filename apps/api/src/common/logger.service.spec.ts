import type { Logger } from '@growthos/shared';
import { AppLoggerService } from './logger.service';

function mockLogger(): jest.Mocked<Pick<Logger, 'info' | 'error' | 'warn' | 'debug' | 'trace'>> {
  return {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
  };
}

describe('AppLoggerService', () => {
  it('logs info messages with the Nest calling context', () => {
    const logger = mockLogger();
    const service = new AppLoggerService('@growthos/api', 'dev', logger as unknown as Logger);

    service.log('server started', 'NestApplication');

    expect(logger.info).toHaveBeenCalledWith({ context: 'NestApplication' }, 'server started');
  });

  it('logs errors with the stack trace and calling context', () => {
    const logger = mockLogger();
    const service = new AppLoggerService('@growthos/api', 'dev', logger as unknown as Logger);

    service.error('boom', 'at Foo.bar', 'FooService');

    expect(logger.error).toHaveBeenCalledWith(
      { context: 'FooService', trace: 'at Foo.bar' },
      'boom',
    );
  });

  it('routes warn/debug/verbose to the matching pino level', () => {
    const logger = mockLogger();
    const service = new AppLoggerService('@growthos/api', 'dev', logger as unknown as Logger);

    service.warn('careful');
    service.debug('details');
    service.verbose('chatter');

    expect(logger.warn).toHaveBeenCalledWith({ context: undefined }, 'careful');
    expect(logger.debug).toHaveBeenCalledWith({ context: undefined }, 'details');
    expect(logger.trace).toHaveBeenCalledWith({ context: undefined }, 'chatter');
  });
});
