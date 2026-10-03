import type { ValidationError, ValidationOptions, ValidationResult } from './types';

export const AD_CHANNEL_IDS = [
  'google_ads',
  'meta_ads',
  'tiktok_ads',
  'linkedin_ads',
  'x_ads',
  'bing_ads',
  'offline_csv',
  'other',
] as const;
export type AdChannelId = (typeof AD_CHANNEL_IDS)[number];

export interface AdSpendDimensions {
  channelId: AdChannelId | string;
  campaignId: string;
  campaignName?: string;
  adsetId?: string;
  adsetName?: string;
  adId?: string;
  adName?: string;
  /** ISO-4217 3-letter currency code (e.g. "USD", "EUR", "ILS") */
  currency: string;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  metadata?: Record<string, unknown>;
}

export interface AdSpendMeasureRecord {
  measure: 'ad_spend';
  /** Date string (YYYY-MM-DD) or ISO-8601 UTC timestamp */
  ts: string;
  /** Decimal spend amount in major currency units (e.g. 1450.50 for $1,450.50) */
  value: number;
  dimensions: AdSpendDimensions;
}

export const AD_SPEND_JSON_SCHEMA: Record<string, unknown> = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'AdSpendMeasureRecord',
  type: 'object',
  required: ['measure', 'ts', 'value', 'dimensions'],
  additionalProperties: true,
  properties: {
    measure: { type: 'string', const: 'ad_spend' },
    ts: {
      type: 'string',
      oneOf: [
        { format: 'date-time' },
        { pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      ],
    },
    value: { type: 'number', minimum: 0 },
    dimensions: {
      type: 'object',
      required: ['channelId', 'campaignId', 'currency'],
      additionalProperties: true,
      properties: {
        channelId: { type: 'string', enum: AD_CHANNEL_IDS as unknown as string[] },
        campaignId: { type: 'string', minLength: 1, maxLength: 256 },
        campaignName: { type: 'string', maxLength: 256 },
        adsetId: { type: 'string', maxLength: 256 },
        adsetName: { type: 'string', maxLength: 256 },
        adId: { type: 'string', maxLength: 256 },
        adName: { type: 'string', maxLength: 256 },
        currency: { type: 'string', minLength: 3, maxLength: 3, pattern: '^[A-Z]{3}$' },
        impressions: { type: 'integer', minimum: 0 },
        clicks: { type: 'integer', minimum: 0 },
        conversions: { type: 'number', minimum: 0 },
        utmSource: { type: 'string', maxLength: 128 },
        utmMedium: { type: 'string', maxLength: 128 },
        utmCampaign: { type: 'string', maxLength: 256 },
        utmContent: { type: 'string', maxLength: 256 },
        utmTerm: { type: 'string', maxLength: 256 },
        metadata: { type: 'object' },
      },
    },
  },
};

export function validateAdSpend(
  payload: unknown,
  options?: ValidationOptions
): ValidationResult<AdSpendMeasureRecord> {
  const errors: ValidationError[] = [];
  let quarantined = false;
  let quarantineReason: string | undefined;

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

  const record = payload as Partial<AdSpendMeasureRecord>;

  // Check measure name (accepts 'ad_spend' as measure or event)
  if (record.measure !== 'ad_spend') {
    errors.push({
      path: 'measure',
      message: `Measure identifier must be 'ad_spend', received '${record.measure}'`,
      code: 'INVALID_ENUM',
    });
  }

  // Check ts
  if (!record.ts || typeof record.ts !== 'string') {
    errors.push({
      path: 'ts',
      message: 'ts is required and must be a YYYY-MM-DD or ISO-8601 date string',
      code: 'REQUIRED_FIELD',
    });
  } else {
    // Normalise date-only strings like 2026-09-02 to UTC ISO string for parsing
    const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(record.ts) ? `${record.ts}T00:00:00.000Z` : record.ts;
    const parsedTs = Date.parse(dateStr);
    if (Number.isNaN(parsedTs)) {
      errors.push({
        path: 'ts',
        message: `Invalid date format: ${record.ts}`,
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

  // Check value
  if (record.value === undefined || record.value === null) {
    errors.push({
      path: 'value',
      message: 'value is required and must be a non-negative number',
      code: 'REQUIRED_FIELD',
    });
  } else if (typeof record.value !== 'number' || Number.isNaN(record.value)) {
    errors.push({
      path: 'value',
      message: 'value must be a valid numeric spend amount',
      code: 'INVALID_TYPE',
    });
  } else if (record.value < 0) {
    quarantined = true;
    quarantineReason = `Negative spend amount detected: ${record.value}`;
    errors.push({
      path: 'value',
      message: `Spend amount cannot be negative (${record.value}). Record has been quarantined.`,
      code: 'NEGATIVE_SPEND',
    });
  }

  // Check dimensions object
  if (!record.dimensions || typeof record.dimensions !== 'object' || Array.isArray(record.dimensions)) {
    errors.push({
      path: 'dimensions',
      message: 'dimensions is required and must be an object',
      code: 'REQUIRED_FIELD',
    });
    return {
      valid: false,
      errors,
      quarantined,
      quarantineReason,
    };
  }

  const dims = record.dimensions as Partial<AdSpendDimensions>;

  // Check channelId
  if (!dims.channelId || typeof dims.channelId !== 'string' || dims.channelId.trim().length === 0) {
    errors.push({
      path: 'dimensions.channelId',
      message: 'channelId is required and must be a valid channel identifier',
      code: 'REQUIRED_FIELD',
    });
  } else if (!AD_CHANNEL_IDS.includes(dims.channelId as AdChannelId)) {
    errors.push({
      path: 'dimensions.channelId',
      message: `Unrecognized channelId '${dims.channelId}'. Expected one of: ${AD_CHANNEL_IDS.join(', ')}`,
      code: 'INVALID_ENUM',
    });
  }

  // Check campaignId
  if (!dims.campaignId || typeof dims.campaignId !== 'string' || dims.campaignId.trim().length === 0) {
    errors.push({
      path: 'dimensions.campaignId',
      message: 'campaignId is required and must be a non-empty string',
      code: 'REQUIRED_FIELD',
    });
  }

  // Check currency
  if (!dims.currency || typeof dims.currency !== 'string') {
    errors.push({
      path: 'dimensions.currency',
      message: 'currency is required and must be a 3-letter ISO-4217 uppercase code',
      code: 'REQUIRED_FIELD',
    });
  } else if (!/^[A-Z]{3}$/.test(dims.currency.toUpperCase())) {
    errors.push({
      path: 'dimensions.currency',
      message: `Invalid currency format '${dims.currency}'. Must be 3-letter ISO code (e.g. USD, EUR, ILS)`,
      code: 'INVALID_FORMAT',
    });
  }

  // Check impressions if present
  if (dims.impressions !== undefined && dims.impressions !== null) {
    if (typeof dims.impressions !== 'number' || !Number.isInteger(dims.impressions) || dims.impressions < 0) {
      errors.push({
        path: 'dimensions.impressions',
        message: 'impressions must be a non-negative integer',
        code: 'OUT_OF_RANGE',
      });
    }
  }

  // Check clicks if present
  if (dims.clicks !== undefined && dims.clicks !== null) {
    if (typeof dims.clicks !== 'number' || !Number.isInteger(dims.clicks) || dims.clicks < 0) {
      errors.push({
        path: 'dimensions.clicks',
        message: 'clicks must be a non-negative integer',
        code: 'OUT_OF_RANGE',
      });
    }
  }

  // Check conversions if present
  if (dims.conversions !== undefined && dims.conversions !== null) {
    if (typeof dims.conversions !== 'number' || dims.conversions < 0) {
      errors.push({
        path: 'dimensions.conversions',
        message: 'conversions must be a non-negative number',
        code: 'OUT_OF_RANGE',
      });
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      quarantined,
      quarantineReason,
    };
  }

  return {
    valid: true,
    data: {
      measure: 'ad_spend',
      ts: record.ts!,
      value: record.value!,
      dimensions: {
        channelId: dims.channelId as AdChannelId,
        campaignId: dims.campaignId!,
        campaignName: dims.campaignName,
        adsetId: dims.adsetId,
        adsetName: dims.adsetName,
        adId: dims.adId,
        adName: dims.adName,
        currency: dims.currency!.toUpperCase(),
        impressions: dims.impressions,
        clicks: dims.clicks,
        conversions: dims.conversions,
        utmSource: dims.utmSource,
        utmMedium: dims.utmMedium,
        utmCampaign: dims.utmCampaign,
        utmContent: dims.utmContent,
        utmTerm: dims.utmTerm,
        metadata: dims.metadata,
      },
    },
  };
}
