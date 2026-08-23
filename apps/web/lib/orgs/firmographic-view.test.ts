import { describe, expect, it } from 'vitest';
import { firmographicIndustryLabelKey, toFirmographicCompositionRows } from './firmographic-view';

describe('firmographicIndustryLabelKey', () => {
  it('maps every known industry to its translation key', () => {
    expect(firmographicIndustryLabelKey('saas_software')).toBe('industrySaasSoftware');
    expect(firmographicIndustryLabelKey('ecommerce_retail')).toBe('industryEcommerceRetail');
    expect(firmographicIndustryLabelKey('healthcare')).toBe('industryHealthcare');
    expect(firmographicIndustryLabelKey('finance_fintech')).toBe('industryFinanceFintech');
    expect(firmographicIndustryLabelKey('education')).toBe('industryEducation');
    expect(firmographicIndustryLabelKey('professional_services')).toBe('industryProfessionalServices');
    expect(firmographicIndustryLabelKey('manufacturing')).toBe('industryManufacturing');
    expect(firmographicIndustryLabelKey('media_entertainment')).toBe('industryMediaEntertainment');
    expect(firmographicIndustryLabelKey('nonprofit')).toBe('industryNonprofit');
    expect(firmographicIndustryLabelKey('other')).toBe('industryOther');
  });

  it('falls back to the raw value for an unrecognized industry', () => {
    expect(firmographicIndustryLabelKey('some_future_industry')).toBe('some_future_industry');
  });
});

describe('toFirmographicCompositionRows', () => {
  it('flattens rows into {value, count, mrr}, most profiles first', () => {
    const rows = toFirmographicCompositionRows(
      [
        { industry: 'healthcare', firmographic_profiles_total: 3, firmographic_mrr_total: 300 },
        { industry: 'saas_software', firmographic_profiles_total: 7, firmographic_mrr_total: 1400 },
      ],
      'industry',
    );
    expect(rows).toEqual([
      { value: 'saas_software', count: 7, mrr: 1400 },
      { value: 'healthcare', count: 3, mrr: 300 },
    ]);
  });

  it('treats a null dimension value as an empty-string bucket and null count/mrr as zero', () => {
    const rows = toFirmographicCompositionRows([{ region: null, firmographic_profiles_total: null, firmographic_mrr_total: null }], 'region');
    expect(rows).toEqual([{ value: '', count: 0, mrr: 0 }]);
  });

  it('breaks ties on count alphabetically by value', () => {
    const rows = toFirmographicCompositionRows(
      [
        { employee_count_range: '51-200', firmographic_profiles_total: 2, firmographic_mrr_total: 100 },
        { employee_count_range: '11-50', firmographic_profiles_total: 2, firmographic_mrr_total: 50 },
      ],
      'employee_count_range',
    );
    expect(rows.map((row) => row.value)).toEqual(['11-50', '51-200']);
  });

  it('sums count and mrr across more than one bucket_date row for the same dimension value', () => {
    const rows = toFirmographicCompositionRows(
      [
        { bucket_date: '2026-01-01', industry: 'saas_software', firmographic_profiles_total: 2, firmographic_mrr_total: 200 },
        { bucket_date: '2027-01-01', industry: 'saas_software', firmographic_profiles_total: 3, firmographic_mrr_total: 300 },
      ],
      'industry',
    );
    expect(rows).toEqual([{ value: 'saas_software', count: 5, mrr: 500 }]);
  });
});
