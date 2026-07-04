/**
 * Structured JSON logger factory (KAN-20). Every line is stamped with the
 * `trace_id` bound via `runWithTraceId`, so logs and their Sentry event share
 * one id a human can search on.
 */
import pino, { type DestinationStream, type Logger } from 'pino';
import { getTraceId } from './trace-context';

export type { Logger };

export interface CreateLoggerOptions {
  level?: string;
}

export function createLogger(
  service: string,
  options: CreateLoggerOptions = {},
  destination?: DestinationStream,
): Logger {
  return pino(
    {
      name: service,
      level: options.level ?? process.env.LOG_LEVEL ?? 'info',
      base: { service },
      timestamp: pino.stdTimeFunctions.isoTime,
      mixin: () => {
        const traceId = getTraceId();
        return traceId ? { trace_id: traceId } : {};
      },
    },
    destination,
  );
}
