import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Logger } from '@growthos/shared';
import { captureException } from '../instrumentation/sentry';
import { getActiveTraceId } from '../instrumentation/telemetry';

interface MinimalRequest {
  method: string;
  url: string;
}

interface MinimalResponse {
  status(code: number): MinimalResponse;
  json(body: unknown): void;
}

/** Catches every unhandled exception: logs it structured, reports it to Sentry with the trace id, and returns a uniform error body. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const httpContext = host.switchToHttp();
    const request = httpContext.getRequest<MinimalRequest>();
    const response = httpContext.getResponse<MinimalResponse>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message =
      exception instanceof HttpException ? exception.getResponse() : 'Internal server error';
    const traceId = getActiveTraceId();

    this.logger.error(
      {
        err: exception,
        traceId,
        method: request.method,
        path: request.url,
        status,
      },
      'Unhandled exception',
    );
    captureException(exception, { traceId });

    response.status(status).json({
      statusCode: status,
      message,
      traceId,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
