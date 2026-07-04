import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from './logger';

function captureLines(): { stream: Writable; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return {
    stream,
    lines: () =>
      chunks
        .join('')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

describe('createLogger', () => {
  it('emits structured JSON with service/environment base fields', () => {
    const { stream, lines } = captureLines();
    const logger = createLogger({ service: '@growthos/api', environment: 'dev', destination: stream });
    logger.info('hello');

    const [entry] = lines();
    expect(entry).toMatchObject({ service: '@growthos/api', environment: 'dev', msg: 'hello' });
    expect(typeof entry.time).toBe('string');
  });

  it('omits the environment field when none is given', () => {
    const { stream, lines } = captureLines();
    const logger = createLogger({ service: '@growthos/api', destination: stream });
    logger.info('hello');

    const [entry] = lines();
    expect(entry).not.toHaveProperty('environment');
  });

  it('defaults level to LOG_LEVEL env, falling back to info', () => {
    const previous = process.env.LOG_LEVEL;
    delete process.env.LOG_LEVEL;
    try {
      const logger = createLogger({ service: '@growthos/api' });
      expect(logger.level).toBe('info');
    } finally {
      if (previous !== undefined) process.env.LOG_LEVEL = previous;
    }
  });

  it('reads LOG_LEVEL from the environment when no explicit level is given', () => {
    const previous = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'warn';
    try {
      const logger = createLogger({ service: '@growthos/api' });
      expect(logger.level).toBe('warn');
    } finally {
      if (previous === undefined) delete process.env.LOG_LEVEL;
      else process.env.LOG_LEVEL = previous;
    }
  });

  it('honors an explicit level over LOG_LEVEL', () => {
    const logger = createLogger({ service: '@growthos/api', level: 'debug' });
    expect(logger.level).toBe('debug');
  });

  it('falls back to info when LOG_LEVEL is set but empty, instead of crashing', () => {
    const previous = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = '';
    try {
      const logger = createLogger({ service: '@growthos/api' });
      expect(logger.level).toBe('info');
    } finally {
      if (previous === undefined) delete process.env.LOG_LEVEL;
      else process.env.LOG_LEVEL = previous;
    }
  });

  it('redacts secret-shaped fields nested one level deep', () => {
    const { stream, lines } = captureLines();
    const logger = createLogger({ service: '@growthos/api', destination: stream });
    logger.info({ user: { password: 'hunter2', token: 'abc', name: 'ada' } }, 'login');

    const [entry] = lines();
    const user = entry.user as { password: string; token: string; name: string };
    expect(user.password).toBe('[REDACTED]');
    expect(user.token).toBe('[REDACTED]');
    expect(user.name).toBe('ada');
  });

  it('redacts secret-shaped fields at the top level', () => {
    const { stream, lines } = captureLines();
    const logger = createLogger({ service: '@growthos/api', destination: stream });
    logger.info({ password: 'top-level-secret', name: 'ada' }, 'login');

    const [entry] = lines();
    expect(entry.password).toBe('[REDACTED]');
    expect(entry.name).toBe('ada');
  });
});
