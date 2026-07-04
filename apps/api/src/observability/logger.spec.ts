import { Writable } from 'node:stream';
import { trace } from '@opentelemetry/api';
import { createLogger } from './logger';
import { shutdownTracing, startTracing } from './tracing';

function captureStream(): { stream: Writable; chunks: string[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return { stream, chunks };
}

describe('logger', () => {
  afterEach(async () => {
    await shutdownTracing();
  });

  it('emits structured JSON log lines', () => {
    const { stream, chunks } = captureStream();
    const logger = createLogger(stream);

    logger.info({ foo: 'bar' }, 'hello world');

    expect(chunks).toHaveLength(1);
    const line = JSON.parse(chunks[0]);
    expect(line.msg).toBe('hello world');
    expect(line.foo).toBe('bar');
    expect(line.service).toBe('@growthos/api');
    expect(line.traceId).toBeUndefined();
  });

  it('mixes in the active OpenTelemetry trace id when present', () => {
    startTracing();
    const { stream, chunks } = captureStream();
    const logger = createLogger(stream);

    trace.getTracer('logger.spec').startActiveSpan('span', (span) => {
      logger.info('inside a span');
      span.end();
    });

    const line = JSON.parse(chunks[0]);
    expect(line.traceId).toMatch(/^[0-9a-f]{32}$/);
  });
});
