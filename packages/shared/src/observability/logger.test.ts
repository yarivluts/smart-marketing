import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from './logger';
import { runWithTraceId } from './trace-context';

function captureStream(): { stream: Writable; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return {
    stream,
    lines: () => chunks.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

describe('createLogger', () => {
  it('emits structured JSON with the service name and no trace_id outside a trace context', () => {
    const { stream, lines } = captureStream();
    const logger = createLogger('@growthos/test', {}, stream);

    logger.info('hello');

    const [line] = lines();
    expect(line).toMatchObject({ service: '@growthos/test', msg: 'hello' });
    expect(line).not.toHaveProperty('trace_id');
  });

  it('stamps trace_id on every line written inside runWithTraceId', () => {
    const { stream, lines } = captureStream();
    const logger = createLogger('@growthos/api', {}, stream);

    runWithTraceId('trace-xyz', () => {
      logger.info('inside trace');
    });
    logger.info('outside trace');

    const [inside, outside] = lines();
    expect(inside).toMatchObject({ trace_id: 'trace-xyz', msg: 'inside trace' });
    expect(outside).not.toHaveProperty('trace_id');
  });

  it('defaults to info level and honours a level override', () => {
    const logger = createLogger('@growthos/api');
    expect(logger.level).toBe('info');

    const debugLogger = createLogger('@growthos/api', { level: 'debug' });
    expect(debugLogger.level).toBe('debug');
  });
});
