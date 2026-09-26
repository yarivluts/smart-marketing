import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { TrialPipelineWidget } from './trial-pipeline-widget';
import type { TrialPipelineWidgetView } from '@/lib/orgs/trial-pipeline-view';
import messages from '../../messages/en.json';

function renderWidget(view: TrialPipelineWidgetView) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TrialPipelineWidget view={view} />
    </NextIntlClientProvider>,
  );
}

describe('TrialPipelineWidget', () => {
  it('renders the active-trial count and conversion percentage', () => {
    renderWidget({ status: 'ok', activeTrials: 42, conversionRatePct: 18.5 });
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('18.5%')).toBeInTheDocument();
    expect(screen.getByText('In trial now')).toBeInTheDocument();
    expect(screen.getByText('Converting at')).toBeInTheDocument();
  });

  it('shows a dash for the conversion rate when there is no conversion data yet', () => {
    renderWidget({ status: 'ok', activeTrials: 3, conversionRatePct: null });
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows a translated empty state when the warehouse is not configured', () => {
    renderWidget({ status: 'unavailable', reason: 'warehouse_not_configured' });
    expect(screen.getByText('Trial pipeline data needs a connected warehouse.')).toBeInTheDocument();
  });

  it('shows a translated empty state when the daily quota is exceeded', () => {
    renderWidget({ status: 'unavailable', reason: 'quota_exceeded' });
    expect(screen.getByText("This project's daily query quota is exhausted. Try again tomorrow.")).toBeInTheDocument();
  });

  it('shows a translated empty state on a query error (e.g. the SaaS pack was never installed)', () => {
    renderWidget({ status: 'unavailable', reason: 'query_error' });
    expect(screen.getByText("Couldn't load trial pipeline data. Install the SaaS metric pack to see it here.")).toBeInTheDocument();
  });
});
