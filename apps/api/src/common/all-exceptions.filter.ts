import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { SentryExceptionCaptured } from '@sentry/nestjs';
import { createLogger, getTraceId } from '@growthos/shared';

interface RequestLike {
  method: string;
  url: string;
}

interface ResponseLike {
  status(code: number): { json(body: unknown): void };
}

const logger = createLogger('@growthos/api');

/**
 * Global catch-all filter (KAN-20). `@SentryExceptionCaptured()` reports the
 * exception to Sentry; the current request's trace id (tagged onto the
 * Sentry scope by `TraceMiddleware`) travels with it, so the same id that
 * shows up in our structured logs and the client's `x-trace-id` response
 * header also shows up on the Sentry event.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  @SentryExceptionCaptured()
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<ResponseLike>();
    const request = ctx.getRequest<RequestLike>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message =
      exception instanceof HttpException ? exception.message : 'Internal server error';
    const traceId = getTraceId();

    logger.error(
      { err: exception, trace_id: traceId, method: request?.method, path: request?.url, status },
      'unhandled exception',
    );

    response.status(status).json({ statusCode: status, message, traceId });
  }
}
