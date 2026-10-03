import type { ValidationError, ValidationOptions, ValidationResult } from './types';

export const CRM_STAGES = [
  'lead',
  'mql',
  'sql',
  'opportunity',
  'demo_scheduled',
  'demo_held',
  'demo_no_show',
  'customer',
  'lost',
  'churned',
] as const;
export type CrmStage = (typeof CRM_STAGES)[number];

export const CRM_SOURCES = [
  'hubspot',
  'salesforce',
  'pipedrive',
  'zoho',
  'close',
  'custom',
] as const;
export type CrmSource = (typeof CRM_SOURCES)[number];

export interface CrmLifecycleProperties {
  stage: CrmStage;
  dealId?: string;
  dealName?: string;
  dealValueCents?: number;
  /** ISO-4217 3-letter currency code (e.g. "USD", "EUR", "ILS") */
  currency?: string;
  ownerEmail?: string;
  ownerName?: string;
  companyName?: string;
  companyDomain?: string;
  leadSource?: string;
  lostReason?: string;
  sourceCrm?: CrmSource | string;
  customFields?: Record<string, unknown>;
}

export interface CrmLifecycleEvent {
  eventId: string;
  event: 'crm_lifecycle';
  /** ISO-8601 UTC timestamp */
  ts: string;
  customerId: string;
  properties: CrmLifecycleProperties;
}

export const CRM_LIFECYCLE_JSON_SCHEMA: Record<string, unknown> = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'CrmLifecycleEvent',
  type: 'object',
  required: ['eventId', 'event', 'ts', 'customerId', 'properties'],
  additionalProperties: true,
  properties: {
    eventId: { type: 'string', minLength: 1, maxLength: 128 },
    event: { type: 'string', const: 'crm_lifecycle' },
    ts: { type: 'string', format: 'date-time' },
    customerId: { type: 'string', minLength: 1, maxLength: 256 },
    properties: {
      type: 'object',
      required: ['stage'],
      additionalProperties: true,
      properties: {
        stage: { type: 'string', enum: CRM_STAGES as unknown as string[] },
        dealId: { type: 'string', maxLength: 256 },
        dealName: { type: 'string', maxLength: 256 },
        dealValueCents: { type: 'integer', minimum: 0 },
        currency: { type: 'string', minLength: 3, maxLength: 3, pattern: '^[A-Z]{3}$' },
        ownerEmail: { type: 'string', format: 'email', maxLength: 256 },
        ownerName: { type: 'string', maxLength: 256 },
        companyName: { type: 'string', maxLength: 256 },
        companyDomain: { type: 'string', maxLength: 256 },
        leadSource: { type: 'string', maxLength: 128 },
        lostReason: { type: 'string', maxLength: 512 },
        sourceCrm: { type: 'string', maxLength: 64 },
        customFields: { type: 'object' },
      },
    },
  },
};

export function validateCrmLifecycle(
  payload: unknown,
  options?: ValidationOptions
): ValidationResult<CrmLifecycleEvent> {
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

  const record = payload as Partial<CrmLifecycleEvent>;

  // Check event name
  if (record.event !== 'crm_lifecycle') {
    errors.push({
      path: 'event',
      message: `Event name must be 'crm_lifecycle', received '${record.event}'`,
      code: 'INVALID_ENUM',
    });
  }

  // Check eventId
  if (!record.eventId || typeof record.eventId !== 'string' || record.eventId.trim().length === 0) {
    errors.push({
      path: 'eventId',
      message: 'eventId is required and must be a non-empty string',
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

  // Check customerId
  if (!record.customerId || typeof record.customerId !== 'string' || record.customerId.trim().length === 0) {
    errors.push({
      path: 'customerId',
      message: 'customerId is required and must be a non-empty string',
      code: 'REQUIRED_FIELD',
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

  const props = record.properties as Partial<CrmLifecycleProperties>;

  // Check stage
  if (!props.stage || typeof props.stage !== 'string') {
    errors.push({
      path: 'properties.stage',
      message: 'stage is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (!CRM_STAGES.includes(props.stage as CrmStage)) {
    errors.push({
      path: 'properties.stage',
      message: `Invalid stage '${props.stage}'. Expected one of: ${CRM_STAGES.join(', ')}`,
      code: 'INVALID_ENUM',
    });
  }

  // Check dealValueCents if present
  if (props.dealValueCents !== undefined && props.dealValueCents !== null) {
    if (typeof props.dealValueCents !== 'number' || !Number.isInteger(props.dealValueCents) || props.dealValueCents < 0) {
      errors.push({
        path: 'properties.dealValueCents',
        message: 'dealValueCents must be a non-negative integer in minor units',
        code: 'OUT_OF_RANGE',
      });
    }
  }

  // Check currency if present
  if (props.currency !== undefined && props.currency !== null) {
    if (typeof props.currency !== 'string' || !/^[A-Z]{3}$/.test(props.currency.toUpperCase())) {
      errors.push({
        path: 'properties.currency',
        message: `Invalid currency format '${props.currency}'. Must be 3-letter ISO code (e.g. USD, EUR, ILS)`,
        code: 'INVALID_FORMAT',
      });
    }
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
      event: 'crm_lifecycle',
      ts: record.ts!,
      customerId: record.customerId!,
      properties: {
        stage: props.stage as CrmStage,
        dealId: props.dealId,
        dealName: props.dealName,
        dealValueCents: props.dealValueCents,
        currency: props.currency ? props.currency.toUpperCase() : undefined,
        ownerEmail: props.ownerEmail,
        ownerName: props.ownerName,
        companyName: props.companyName,
        companyDomain: props.companyDomain,
        leadSource: props.leadSource,
        lostReason: props.lostReason,
        sourceCrm: props.sourceCrm,
        customFields: props.customFields,
      },
    },
  };
}
