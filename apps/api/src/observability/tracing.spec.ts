import { trace } from '@opentelemetry/api';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getCurrentTraceId, resolveTraceExporter, shutdownTracing, startTracing } from './tracing';

describe('tracing', () => {
  afterEach(async () => {
    await shutdownTracing();
  });

  describe('resolveTraceExporter', () => {
    it('falls back to a console exporter when no OTLP endpoint is configured', () => {
      expect(resolveTraceExporter(undefined)).toBeInstanceOf(ConsoleSpanExporter);
    });

    it('uses an OTLP HTTP exporter when an endpoint is configured', () => {
      expect(resolveTraceExporter('http://collector:4318/v1/traces')).toBeInstanceOf(OTLPTraceExporter);
    });
  });

  describe('getCurrentTraceId', () => {
    it('returns undefined when there is no active span', () => {
      expect(getCurrentTraceId()).toBeUndefined();
    });

    it('returns the active span trace id once tracing is started', () => {
      startTracing();

      const activeTraceId = trace.getTracer('tracing.spec').startActiveSpan('active-span', (activeSpan) => {
        const id = getCurrentTraceId();
        activeSpan.end();
        return id;
      });

      expect(activeTraceId).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  describe('startTracing', () => {
    it('returns the same NodeSDK instance on repeated calls', () => {
      const first = startTracing();
      const second = startTracing();
      expect(second).toBe(first);
    });
  });
});
