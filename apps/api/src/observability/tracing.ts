import { trace } from '@opentelemetry/api';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ConsoleSpanExporter, type SpanExporter } from '@opentelemetry/sdk-trace-base';
import { NodeSDK } from '@opentelemetry/sdk-node';

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? 'growthos-api';

let sdk: NodeSDK | undefined;

export function resolveTraceExporter(otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT): SpanExporter {
  return otlpEndpoint ? new OTLPTraceExporter({ url: otlpEndpoint }) : new ConsoleSpanExporter();
}

export function startTracing(): NodeSDK {
  if (sdk) {
    return sdk;
  }

  sdk = new NodeSDK({
    serviceName: SERVICE_NAME,
    traceExporter: resolveTraceExporter(),
    instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()],
  });
  sdk.start();

  return sdk;
}

export async function shutdownTracing(): Promise<void> {
  await sdk?.shutdown();
  sdk = undefined;
}

export function getCurrentTraceId(): string | undefined {
  return trace.getActiveSpan()?.spanContext().traceId;
}
