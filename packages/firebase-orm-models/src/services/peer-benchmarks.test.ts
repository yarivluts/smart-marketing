import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  extractProjectObservedMetrics,
  getPeerBenchmarksForProject,
} from './peer-benchmarks.service';
import { ProjectNotFoundError } from './resource-library.service';
import { ProjectModel } from '../models/project.model';
import { RawRecordModel } from '../models/raw-record.model';

vi.mock('../models/project.model', () => ({
  ProjectModel: {
    init: vi.fn(),
  },
}));

vi.mock('../models/raw-record.model', () => ({
  RawRecordModel: {
    initPath: vi.fn(),
  },
}));

describe('peer-benchmarks.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractProjectObservedMetrics', () => {
    it('returns empty object when records are empty', () => {
      const metrics = extractProjectObservedMetrics([]);
      expect(metrics).toEqual({});
    });

    it('extracts roas, cac, ctr, and conversion rate from raw records', () => {
      const records = [
        {
          schema_name: 'ad_performance',
          payload: {
            spend: 500,
            revenue: 2000,
            clicks: 120,
            impressions: 4000,
            conversions: 20,
            visitors: 500,
          },
        },
        {
          schema_name: 'stripe_charge',
          payload: {
            amount: 50000, // $500
          },
        },
      ] as unknown as RawRecordModel[];

      const metrics = extractProjectObservedMetrics(records);

      expect(metrics.roas).toBe(5.0); // (2000 + 500) / 500 = 5.0
      expect(metrics.cac).toBe(23.81); // 500 / 21 = 23.81
      expect(metrics.ctr).toBe(3.0); // (120 / 4000) * 100 = 3.0%
      expect(metrics.conversionRate).toBe(4.2); // (21 / 500) * 100 = 4.2%
    });
  });

  describe('getPeerBenchmarksForProject', () => {
    it('throws ProjectNotFoundError if project is missing or in wrong org', async () => {
      vi.mocked(ProjectModel.init).mockResolvedValueOnce(null as any);

      await expect(
        getPeerBenchmarksForProject('org-1', 'proj-1'),
      ).rejects.toThrow(ProjectNotFoundError);
    });

    it('enforces k-anonymity when sampleMerchantCount is below 5', async () => {
      vi.mocked(ProjectModel.init).mockResolvedValueOnce({
        id: 'proj-1',
        organization_id: 'org-1',
      } as any);

      const mockQuery = {
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(RawRecordModel.initPath).mockReturnValue(mockQuery as any);

      const result = await getPeerBenchmarksForProject('org-1', 'proj-1', {
        sampleMerchantCount: 3,
      });

      expect(result.hasData).toBe(false);
      expect(result.kAnonymityPassed).toBe(false);
      expect(result.minKAnonymityThreshold).toBe(5);
      expect(result.recommendations[0]).toContain('Cohort privacy protection active');
    });

    it('returns full benchmark telemetry when project exists and k-anonymity passes', async () => {
      vi.mocked(ProjectModel.init).mockResolvedValueOnce({
        id: 'proj-1',
        organization_id: 'org-1',
      } as any);

      const mockQuery = {
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(RawRecordModel.initPath).mockReturnValue(mockQuery as any);

      const result = await getPeerBenchmarksForProject('org-1', 'proj-1', {
        industry: 'b2b_saas',
        spendTier: 'growth',
        comparisonTarget: 'all',
      });

      expect(result.hasData).toBe(true);
      expect(result.kAnonymityPassed).toBe(true);
      expect(result.industry).toBe('b2b_saas');
      expect(result.scorecards.roas.projectValue).toBeGreaterThan(0);
      expect(result.scorecards.cac.projectValue).toBeGreaterThan(0);
      expect(result.scorecards.conversionRate.projectValue).toBeGreaterThan(0);
      expect(result.scorecards.ctr.projectValue).toBeGreaterThan(0);
      expect(result.retentionCurve.length).toBe(4);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });
});
