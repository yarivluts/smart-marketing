import { context, trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { NodeSDK } from '@opentelemetry/sdk-node';

/**
 * Starts OpenTelemetry tracing when OTEL_EXPORTER_OTLP_ENDPOINT is configured;
 * returns null otherwise so local/CI runs stay quiet with no collector to send to.
 */
export function initTelemetry(serviceName: string): NodeSDK | null {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return null;

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    instrumentations: [new HttpInstrumentation()],
  });
  sdk.start();
  return sdk;
}

export async function shutdownTelemetry(sdk: NodeSDK | null): Promise<void> {
  if (sdk) await sdk.shutdown();
}

/** The active span's trace id, e.g. to correlate a log line or Sentry event with a trace. */
export function getActiveTraceId(): string | undefined {
  return trace.getSpanContext(context.active())?.traceId;
}
