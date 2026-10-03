import type { ValidationError, ValidationOptions, ValidationResult } from './types';

export const TELEMETRY_PLATFORMS = [
  'web',
  'ios',
  'android',
  'react_native',
  'flutter',
  'backend',
  'api',
  'other',
] as const;
export type TelemetryPlatform = (typeof TELEMETRY_PLATFORMS)[number];

export const COMMON_TELEMETRY_EVENTS = [
  'session_start',
  'user_ping',
  'feature_used',
  'feature_exposure',
  'page_view',
  'signup_completed',
  'identify',
  'screen_view',
  'button_click',
] as const;
export type CommonTelemetryEvent = (typeof COMMON_TELEMETRY_EVENTS)[number];

export interface ProductTelemetryProperties {
  sessionId: string;
  platform: TelemetryPlatform | string;
  appVersion?: string;
  url?: string;
  path?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  clickId?: string;
  featureName?: string;
  pageTitle?: string;
  durationSeconds?: number;
  customProperties?: Record<string, unknown>;
}

export interface ProductTelemetryEvent {
  eventId: string;
  /** Event name (e.g. 'session_start', 'user_ping', 'feature_used') */
  event: string;
  /** ISO-8601 UTC timestamp */
  ts: string;
  /** Anonymous persistent client identifier (device/cookie UUID) */
  anonId: string;
  /** Authenticated user or customer ID (required if event is 'identify') */
  customerId?: string;
  properties: ProductTelemetryProperties;
}

export const PRODUCT_TELEMETRY_JSON_SCHEMA: Record<string, unknown> = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'ProductTelemetryEvent',
  type: 'object',
  required: ['eventId', 'event', 'ts', 'anonId', 'properties'],
  additionalProperties: true,
  properties: {
    eventId: { type: 'string', minLength: 1, maxLength: 128 },
    event: { type: 'string', minLength: 1, maxLength: 128 },
    ts: { type: 'string', format: 'date-time' },
    anonId: { type: 'string', minLength: 1, maxLength: 256 },
    customerId: { type: 'string', maxLength: 256 },
    properties: {
      type: 'object',
      required: ['sessionId', 'platform'],
      additionalProperties: true,
      properties: {
        sessionId: { type: 'string', minLength: 1, maxLength: 256 },
        platform: { type: 'string', enum: TELEMETRY_PLATFORMS as unknown as string[] },
        appVersion: { type: 'string', maxLength: 64 },
        url: { type: 'string', maxLength: 2048 },
        path: { type: 'string', maxLength: 1024 },
        referrer: { type: 'string', maxLength: 2048 },
        utmSource: { type: 'string', maxLength: 128 },
        utmMedium: { type: 'string', maxLength: 128 },
        utmCampaign: { type: 'string', maxLength: 256 },
        utmContent: { type: 'string', maxLength: 256 },
        utmTerm: { type: 'string', maxLength: 256 },
        clickId: { type: 'string', maxLength: 256 },
        featureName: { type: 'string', maxLength: 128 },
        pageTitle: { type: 'string', maxLength: 256 },
        durationSeconds: { type: 'number', minimum: 0 },
        customProperties: { type: 'object' },
      },
    },
  },
};

export function validateProductTelemetry(
  payload: unknown,
  options?: ValidationOptions
): ValidationResult<ProductTelemetryEvent> {
  const errors: ValidationError[] = [];

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      valid: false,
      errors: [
        {
          path: '',
          message: 'Payload must be a non-null object',
          code: 'INVALID_PAYLOAD',
        },
      ],
    };
  }

  const record = payload as Partial<ProductTelemetryEvent>;

  // Check eventId
  if (!record.eventId || typeof record.eventId !== 'string' || record.eventId.trim().length === 0) {
    errors.push({
      path: 'eventId',
      message: 'eventId is required and must be a non-empty string',
      code: 'REQUIRED_FIELD',
    });
  }

  // Check event name
  if (!record.event || typeof record.event !== 'string' || record.event.trim().length === 0) {
    errors.push({
      path: 'event',
      message: 'event name is required and must be a non-empty string',
      code: 'REQUIRED_FIELD',
    });
  }

  // Check ts
  if (!record.ts || typeof record.ts !== 'string') {
    errors.push({
      path: 'ts',
      message: 'ts is required and must be an ISO-8601 timestamp string',
      code: 'REQUIRED_FIELD',
    });
  } else {
    const parsedTs = Date.parse(record.ts);
    if (Number.isNaN(parsedTs)) {
      errors.push({
        path: 'ts',
        message: `Invalid ISO-8601 date timestamp: ${record.ts}`,
        code: 'INVALID_FORMAT',
      });
    } else {
      // Clock skew verification
      const nowMs = options?.now ? new Date(options.now).getTime() : Date.now();
      const maxFutureMs = (options?.maxFutureSkewSeconds ?? 86400) * 1000;
      const maxPastMs = (options?.maxPastSkewSeconds ?? 31536000) * 1000;

      if (parsedTs > nowMs + maxFutureMs) {
        errors.push({
          path: 'ts',
          message: `Timestamp is too far in the future (${record.ts}), exceeds max allowed skew of ${options?.maxFutureSkewSeconds ?? 86400}s`,
          code: 'CLOCK_SKEW_FUTURE',
        });
      } else if (parsedTs < nowMs - maxPastMs) {
        errors.push({
          path: 'ts',
          message: `Timestamp is too far in the past (${record.ts}), exceeds max allowed retention of ${options?.maxPastSkewSeconds ?? 31536000}s`,
          code: 'CLOCK_SKEW_PAST',
        });
      }
    }
  }

  // Check anonId
  if (!record.anonId || typeof record.anonId !== 'string' || record.anonId.trim().length === 0) {
    errors.push({
      path: 'anonId',
      message: 'anonId is required on all product telemetry events',
      code: 'REQUIRED_FIELD',
    });
  }

  // Cross check identify event requires customerId
  if (record.event === 'identify' && (!record.customerId || typeof record.customerId !== 'string' || record.customerId.trim().length === 0)) {
    errors.push({
      path: 'customerId',
      message: "customerId is required when event is 'identify'",
      code: 'BUSINESS_LOGIC_VIOLATION',
    });
  }

  // Check properties object
  if (!record.properties || typeof record.properties !== 'object' || Array.isArray(record.properties)) {
    errors.push({
      path: 'properties',
      message: 'properties is required and must be an object',
      code: 'REQUIRED_FIELD',
    });
    return {
      valid: false,
      errors,
    };
  }

  const props = record.properties as Partial<ProductTelemetryProperties>;

  // Check sessionId
  if (!props.sessionId || typeof props.sessionId !== 'string' || props.sessionId.trim().length === 0) {
    errors.push({
      path: 'properties.sessionId',
      message: 'sessionId is required and must be a non-empty string',
      code: 'REQUIRED_FIELD',
    });
  }

  // Check platform
  if (!props.platform || typeof props.platform !== 'string' || props.platform.trim().length === 0) {
    errors.push({
      path: 'properties.platform',
      message: 'platform is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (!TELEMETRY_PLATFORMS.includes(props.platform as TelemetryPlatform)) {
    errors.push({
      path: 'properties.platform',
      message: `Unrecognized platform '${props.platform}'. Expected one of: ${TELEMETRY_PLATFORMS.join(', ')}`,
      code: 'INVALID_ENUM',
    });
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
    };
  }

  return {
    valid: true,
    data: {
      eventId: record.eventId!,
      event: record.event!,
      ts: record.ts!,
      anonId: record.anonId!,
      customerId: record.customerId,
      properties: {
        sessionId: props.sessionId!,
        platform: props.platform as TelemetryPlatform,
        appVersion: props.appVersion,
        url: props.url,
        path: props.path,
        referrer: props.referrer,
        utmSource: props.utmSource,
        utmMedium: props.utmMedium,
        utmCampaign: props.utmCampaign,
        utmContent: props.utmContent,
        utmTerm: props.utmTerm,
        clickId: props.clickId,
        featureName: props.featureName,
        pageTitle: props.pageTitle,
        durationSeconds: props.durationSeconds,
        customProperties: props.customProperties,
      },
    },
  };
}
