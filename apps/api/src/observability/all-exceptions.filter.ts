import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { logger } from './logger';
import { captureExceptionWithTrace } from './sentry';

interface ErrorResponseBody {
  statusCode: number;
  message: string | object;
  traceId?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = exception instanceof HttpException ? exception.getResponse() : 'Internal server error';

    const traceId = captureExceptionWithTrace(exception);

    logger.error({ err: exception, traceId, status }, 'Unhandled exception');

    const body: ErrorResponseBody = { statusCode: status, message, traceId };
    response.status(status).json(body);
  }
}
