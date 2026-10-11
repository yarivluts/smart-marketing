import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MetricFamilyCard } from './metric-family-card';
import messages from '../../messages/en.json';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const aggregation = (version: number, status: 'active' | 'superseded') => ({
  id: `v${version}`,
  version,
  status,
  definitionKind: 'aggregation' as const,
  aggregation: { function: 'sum' as const, table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] },
  formula: null,
  dimensions: version === 2 ? ['channel'] : [],
  unit: null,
});

describe('MetricFamilyCard', () => {
  it('leads with the latest definition, folds earlier versions, and links to its lineage', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MetricFamilyCard orgId="o" projectId="p" name="ad_spend" versions={[aggregation(1, 'superseded'), aggregation(2, 'active')]} lineageHref="/lineage" usedByCount={3} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('ad_spend', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Aggregation · 2 versions · used by 3 metrics')).toBeInTheDocument();
    expect(screen.getByText('v1 — Superseded').closest('details')).not.toBeNull();
    expect(screen.getByText('v2 — Active').closest('details')).toBeNull();
    expect(screen.getByText('Dimensions: channel')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trace lineage' })).toHaveAttribute('href', '/lineage');
    expect(screen.getByRole('button', { name: 'Evolve' })).toBeInTheDocument();
  });

  it('shows no lineage link when none is given', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MetricFamilyCard orgId="o" projectId="p" name="ad_spend" versions={[aggregation(1, 'active')]} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole('link', { name: 'Trace lineage' })).not.toBeInTheDocument();
    expect(screen.getByText('Aggregation · 1 version')).toBeInTheDocument();
  });
});
