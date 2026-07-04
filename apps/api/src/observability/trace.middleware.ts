import { Injectable, type NestMiddleware } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { generateTraceId, runWithTraceId } from '@growthos/shared';

interface IncomingRequestLike {
  header(name: string): string | undefined;
}

interface OutgoingResponseLike {
  setHeader(name: string, value: string): void;
}

/**
 * Binds one trace id per request to async-local storage (so every structured
 * log line during the request carries it), tags the active Sentry scope with
 * it (so the Sentry event for a thrown error carries it too), and echoes it
 * back as `x-trace-id` for support/debugging correlation.
 */
@Injectable()
export class TraceMiddleware implements NestMiddleware {
  use(req: IncomingRequestLike, res: OutgoingResponseLike, next: () => void): void {
    const traceId = req.header('x-request-id') || generateTraceId();
    res.setHeader('x-trace-id', traceId);
    Sentry.getCurrentScope().setTag('trace_id', traceId);
    runWithTraceId(traceId, () => next());
  }
}
