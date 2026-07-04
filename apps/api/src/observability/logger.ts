import { pino, type DestinationStream, type Logger } from 'pino';
import { getCurrentTraceId } from './tracing';

export function createLogger(destination?: DestinationStream): Logger {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? 'info',
      base: { service: '@growthos/api' },
      mixin() {
        const traceId = getCurrentTraceId();
        return traceId ? { traceId } : {};
      },
    },
    destination,
  );
}

export const logger = createLogger();
