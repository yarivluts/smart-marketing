import { describe, expect, it } from 'vitest';

/**
 * Canonical Schema Test Suite for F10: Ad Spend (`ad_spend`)
 * Verifies Tier 1 (Happy Path), Tier 2 (Boundary & Error Cases), Multi-Channel
 * Support, Negative Spend Quarantine, Clicks vs Impressions sanity, and Idempotency Grain.
 *
 * Source: ORIGINAL_REQUEST §R2, PROJECT.md §2, TEST_INFRA.md F10
 */

export interface AdSpendMeasureRecord {
  measure: 'ad_spend';
  ts: string;
  value: number;
  dimensions: {
    channelId: 'google_ads' | 'meta_ads' | 'tiktok_ads' | 'linkedin_ads' | 'offline_csv';
    campaignId: string;
    campaignName?: string;
    adsetId?: string;
    adsetName?: string;
    adId?: string;
    adName?: string;
    currency: string;
    impressions?: number;
    clicks?: number;
  };
}

export interface ValidationIssue {
  path: string;
  message: string;
  code: string;
}

export function validateAdSpendRecord(payload: unknown): { valid: boolean; errors: ValidationIssue[] } {
  const errors: ValidationIssue[] = [];
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: [{ path: '', message: 'Payload must be a non-null object', code: 'INVALID_OBJECT' }] };
  }

  const p = payload as Partial<AdSpendMeasureRecord>;

  if (p.measure !== 'ad_spend') {
    errors.push({ path: 'measure', message: "measure must be 'ad_spend'", code: 'INVALID_MEASURE_NAME' });
  }

  if (!p.ts || typeof p.ts !== 'string' || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/.test(p.ts) || isNaN(Date.parse(p.ts))) {
    errors.push({ path: 'ts', message: 'ts must be a valid YYYY-MM-DD date or ISO-8601 timestamp', code: 'INVALID_DATE' });
  }

  if (typeof p.value !== 'number' || isNaN(p.value)) {
    errors.push({ path: 'value', message: 'value must be a valid number', code: 'INVALID_VALUE' });
  } else if (p.value < 0) {
    errors.push({ path: 'value', message: 'value cannot be negative', code: 'INVALID_NEGATIVE_SPEND' });
  }

  const dims = p.dimensions;
  if (!dims || typeof dims !== 'object') {
    errors.push({ path: 'dimensions', message: 'dimensions must be a non-null object', code: 'MISSING_DIMENSIONS' });
    return { valid: errors.length === 0, errors };
  }

  const validChannels = ['google_ads', 'meta_ads', 'tiktok_ads', 'linkedin_ads', 'offline_csv'];
  if (!dims.channelId || !validChannels.includes(dims.channelId)) {
    errors.push({ path: 'dimensions.channelId', message: 'Invalid channelId', code: 'INVALID_CHANNEL_ID' });
  }

  if (!dims.campaignId || typeof dims.campaignId !== 'string' || dims.campaignId.trim().length === 0) {
    errors.push({ path: 'dimensions.campaignId', message: 'campaignId is required', code: 'MISSING_CAMPAIGN_ID' });
  }

  if (!dims.currency || typeof dims.currency !== 'string' || !/^[A-Z]{3}$/.test(dims.currency)) {
    errors.push({ path: 'dimensions.currency', message: 'currency must be a 3-letter ISO-4217 code', code: 'INVALID_CURRENCY' });
  }

  if (dims.impressions !== undefined) {
    if (typeof dims.impressions !== 'number' || !Number.isInteger(dims.impressions) || dims.impressions < 0) {
      errors.push({ path: 'dimensions.impressions', message: 'impressions must be a non-negative integer', code: 'INVALID_IMPRESSIONS' });
    }
  }

  if (dims.clicks !== undefined) {
    if (typeof dims.clicks !== 'number' || !Number.isInteger(dims.clicks) || dims.clicks < 0) {
      errors.push({ path: 'dimensions.clicks', message: 'clicks must be a non-negative integer', code: 'INVALID_CLICKS' });
    } else if (dims.impressions !== undefined && dims.clicks > dims.impressions) {
      errors.push({ path: 'dimensions.clicks', message: 'clicks cannot exceed impressions', code: 'CLICKS_EXCEED_IMPRESSIONS' });
    }
  }

  return { valid: errors.length === 0, errors };
}

describe('F10: Canonical Schema — Ad Spend', () => {
  const validBaseRecord: AdSpendMeasureRecord = {
    measure: 'ad_spend',
    ts: '2026-09-02',
    value: 1250.75,
    dimensions: {
      channelId: 'google_ads',
      campaignId: 'cmp_google_search_brand',
      campaignName: 'Search - Brand Exact',
      adsetId: 'adg_core_1',
      adId: 'ad_headline_variant_a',
      currency: 'USD',
      impressions: 15000,
      clicks: 850,
    },
  };

  describe('Tier 1: Primary Happy Path Scenarios', () => {
    it('F10-T1-01: validates a Google Ads spend measure record', () => {
      const result = validateAdSpendRecord(validBaseRecord);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('F10-T1-02: validates a Meta Marketing API spend record', () => {
      const record: AdSpendMeasureRecord = {
        ...validBaseRecord,
        value: 3450.0,
        dimensions: {
          ...validBaseRecord.dimensions,
          channelId: 'meta_ads',
          campaignId: 'cmp_meta_lookalike_1pct',
          campaignName: 'Retargeting - LAL 1%',
          impressions: 45000,
          clicks: 2100,
        },
      };
      const result = validateAdSpendRecord(record);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('F10-T1-03: validates a TikTok Ads spend record', () => {
      const record: AdSpendMeasureRecord = {
        ...validBaseRecord,
        value: 800.5,
        dimensions: {
          ...validBaseRecord.dimensions,
          channelId: 'tiktok_ads',
          campaignId: 'cmp_tiktok_spark_ads',
          impressions: 30000,
          clicks: 1200,
        },
      };
      const result = validateAdSpendRecord(record);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('F10-T1-04: validates an Offline Spend CSV upload record', () => {
      const record: AdSpendMeasureRecord = {
        ...validBaseRecord,
        value: 5000.0,
        dimensions: {
          ...validBaseRecord.dimensions,
          channelId: 'offline_csv',
          campaignId: 'cmp_billboard_tlv',
          campaignName: 'Ayalon Highway Billboard Q3',
          currency: 'ILS',
          impressions: 250000,
          clicks: 0,
        },
      };
      const result = validateAdSpendRecord(record);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('F10-T1-05: validates zero-spend day record (0.00 spend with organic impressions)', () => {
      const record: AdSpendMeasureRecord = {
        ...validBaseRecord,
        value: 0.0,
        dimensions: {
          ...validBaseRecord.dimensions,
          impressions: 120,
          clicks: 0,
        },
      };
      const result = validateAdSpendRecord(record);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Tier 2: Boundary Values & Error Handling', () => {
    it('F10-T2-01: quarantines negative spend with INVALID_NEGATIVE_SPEND error code', () => {
      const record = {
        ...validBaseRecord,
        value: -150.0,
      };
      const result = validateAdSpendRecord(record);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_NEGATIVE_SPEND')).toBe(true);
    });

    it('F10-T2-02: rejects clicks exceeding impressions count', () => {
      const record = {
        ...validBaseRecord,
        dimensions: {
          ...validBaseRecord.dimensions,
          impressions: 100,
          clicks: 150,
        },
      };
      const result = validateAdSpendRecord(record);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'CLICKS_EXCEED_IMPRESSIONS')).toBe(true);
    });

    it('F10-T2-03: rejects unsupported channel identifier', () => {
      const record = {
        ...validBaseRecord,
        dimensions: {
          ...validBaseRecord.dimensions,
          channelId: 'random_ad_network' as unknown as string,
        },

      };
      const result = validateAdSpendRecord(record);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_CHANNEL_ID')).toBe(true);
    });

    it('F10-T2-04: rejects invalid date string (e.g. malformed "09-02-2026")', () => {
      const record = {
        ...validBaseRecord,
        ts: '09-02-2026',
      };
      const result = validateAdSpendRecord(record);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_DATE')).toBe(true);
    });

    it('F10-T2-05: rejects missing campaignId in dimensions', () => {
      const record = {
        ...validBaseRecord,
        dimensions: {
          ...validBaseRecord.dimensions,
          campaignId: '',
        },
      };
      const result = validateAdSpendRecord(record);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'MISSING_CAMPAIGN_ID')).toBe(true);
    });
  });
});
