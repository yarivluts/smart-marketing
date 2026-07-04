import { context, trace } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';

const start = jest.fn();
const shutdown = jest.fn().mockResolvedValue(undefined);

jest.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: jest.fn().mockImplementation(() => ({ start, shutdown })),
}));

import { getActiveTraceId, initTelemetry, shutdownTelemetry } from './telemetry';
import { NodeSDK } from '@opentelemetry/sdk-node';

describe('telemetry', () => {
  const previousEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  afterEach(() => {
    if (previousEndpoint === undefined) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = previousEndpoint;
    jest.clearAllMocks();
  });

  describe('initTelemetry', () => {
    it('no-ops when OTEL_EXPORTER_OTLP_ENDPOINT is unset', () => {
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

      const sdk = initTelemetry('@growthos/api');

      expect(sdk).toBeNull();
      expect(NodeSDK).not.toHaveBeenCalled();
    });

    it('starts the SDK when an OTLP endpoint is configured', () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector:4318';

      const sdk = initTelemetry('@growthos/api');

      expect(NodeSDK).toHaveBeenCalledTimes(1);
      expect(start).toHaveBeenCalledTimes(1);
      expect(sdk).not.toBeNull();
    });
  });

  describe('shutdownTelemetry', () => {
    it('shuts down a running SDK', async () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector:4318';
      const sdk = initTelemetry('@growthos/api');

      await shutdownTelemetry(sdk);

      expect(shutdown).toHaveBeenCalledTimes(1);
    });

    it('is a no-op for a null SDK', async () => {
      await expect(shutdownTelemetry(null)).resolves.toBeUndefined();
      expect(shutdown).not.toHaveBeenCalled();
    });
  });

  describe('getActiveTraceId', () => {
    it('returns undefined outside of an active span', () => {
      expect(getActiveTraceId()).toBeUndefined();
    });

    it('returns the trace id of the active span', () => {
      const contextManager = new AsyncHooksContextManager().enable();
      context.setGlobalContextManager(contextManager);

      try {
        const tracer = trace.getTracer('test');
        tracer.startActiveSpan('unit-test', (span) => {
          expect(getActiveTraceId()).toBe(span.spanContext().traceId);
          span.end();
        });
      } finally {
        context.disable();
        contextManager.disable();
      }
    });
  });
});
