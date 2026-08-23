import { describe, expect, it } from 'vitest';
import { classifyCompanyIndustry } from './classifier';

describe('classifyCompanyIndustry', () => {
  it('classifies via a strong name keyword', () => {
    expect(classifyCompanyIndustry('Acme Health Clinic')).toBe('healthcare');
    expect(classifyCompanyIndustry('Northwind Capital Bank')).toBe('finance_fintech');
    expect(classifyCompanyIndustry('Riverside Retail Shop')).toBe('ecommerce_retail');
    expect(classifyCompanyIndustry('Summit Academy School')).toBe('education');
    expect(classifyCompanyIndustry('Delta Manufacturing Factory')).toBe('manufacturing');
    expect(classifyCompanyIndustry('Bluebird Media Studio')).toBe('media_entertainment');
    expect(classifyCompanyIndustry('Hope Foundation')).toBe('nonprofit');
    expect(classifyCompanyIndustry('Sterling Legal Advisors')).toBe('professional_services');
    expect(classifyCompanyIndustry('Nimbus Cloud Systems')).toBe('saas_software');
  });

  it('picks the keyword bucket with the most hits when a name matches more than one', () => {
    // "software" + "systems" (2 saas hits) outweighs a single "labs" hit elsewhere would tie,
    // so use a name with two saas-only keywords vs one competing bucket's single keyword.
    expect(classifyCompanyIndustry('Acme Software Systems Health')).toBe('saas_software');
  });

  it('falls back to a domain TLD hint when the name matches nothing', () => {
    expect(classifyCompanyIndustry('Acme Corp', 'acme.edu')).toBe('education');
    expect(classifyCompanyIndustry('Acme Corp', 'acme.io')).toBe('saas_software');
    expect(classifyCompanyIndustry('Acme Corp', 'acme.org')).toBe('nonprofit');
  });

  it('prefers a name-keyword match over a domain TLD hint', () => {
    expect(classifyCompanyIndustry('Acme Health Clinic', 'acme.io')).toBe('healthcare');
  });

  it('returns other when neither the name nor the domain match anything', () => {
    expect(classifyCompanyIndustry('Acme Corp', 'acme.com')).toBe('other');
    expect(classifyCompanyIndustry('Acme Corp')).toBe('other');
  });

  it('is case-insensitive on both name and domain', () => {
    expect(classifyCompanyIndustry('ACME HEALTH CLINIC')).toBe('healthcare');
    expect(classifyCompanyIndustry('Acme Corp', 'ACME.EDU')).toBe('education');
  });
});
