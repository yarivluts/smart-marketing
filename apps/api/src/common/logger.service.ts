import { Injectable, type LoggerService } from '@nestjs/common';
import { createLogger, type Logger as PinoLogger } from '@growthos/shared';
import type { Environment } from '@growthos/shared';

/** Adapts the shared pino logger to Nest's LoggerService so app.useLogger() emits structured JSON. */
@Injectable()
export class AppLoggerService implements LoggerService {
  private readonly logger: PinoLogger;

  constructor(service: string, environment?: Environment, logger?: PinoLogger) {
    this.logger = logger ?? createLogger({ service, environment });
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.info({ context: lastContext(optionalParams) }, String(message));
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.error(
      { context: lastContext(optionalParams), trace: optionalParams[0] },
      String(message),
    );
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.warn({ context: lastContext(optionalParams) }, String(message));
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.debug({ context: lastContext(optionalParams) }, String(message));
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.trace({ context: lastContext(optionalParams) }, String(message));
  }
}

/** Nest passes the calling context (e.g. "NestApplication") as the last string param. */
function lastContext(params: unknown[]): string | undefined {
  const last = params[params.length - 1];
  return typeof last === 'string' ? last : undefined;
}
