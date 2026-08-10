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

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  'token',
  'apiKey',
  'secret',
  'dsn',
  '*.password',
  '*.token',
  '*.apiKey',
  '*.secret',
  '*.dsn',
];

export function createLogger(
  service: string,
  options: CreateLoggerOptions = {},
  destination?: DestinationStream,
): Logger {
  return pino(
    {
      name: service,
      // `??` would let LOG_LEVEL="" reach pino, which throws at boot — `||` treats it as unset.
      level: options.level || process.env.LOG_LEVEL || 'info',
      base: { service },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: REDACT_PATHS,
        censor: '[REDACTED]',
      },
      mixin: () => {
        const traceId = getTraceId();
        return traceId ? { trace_id: traceId } : {};
      },
    },
    destination,
  );
}
