import pino, { type DestinationStream, type Logger } from 'pino';
import type { Environment } from './env';

export interface CreateLoggerOptions {
  service: string;
  environment?: Environment;
  level?: string;
  /** Override the write destination (tests only); defaults to stdout. */
  destination?: DestinationStream;
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

/**
 * Structured JSON logger shared by every GrowthOS service. Level defaults to
 * LOG_LEVEL (or "info"); common secret-shaped fields are redacted so raw
 * tokens/passwords never reach log sinks.
 */
export function createLogger(options: CreateLoggerOptions): Logger {
  const { service, environment, level, destination } = options;

  return pino(
    {
      name: service,
      level: level || process.env.LOG_LEVEL || 'info',
      base: {
        service,
        ...(environment ? { environment } : {}),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: REDACT_PATHS,
        censor: '[REDACTED]',
      },
    },
    destination,
  );
}

export type { Logger } from 'pino';
