import React from 'react';
import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { ProductDemoShowcase } from './product-demo-showcase';

describe('ProductDemoShowcase Component', () => {
  it('renders all 4 tabs and defaults to Executive Pulse', () => {
    renderWithIntl(<ProductDemoShowcase />);

    expect(screen.getByTestId('product-demo-showcase')).toBeInTheDocument();
    expect(screen.getByText(/MRR Velocity|מהירות MRR/i)).toBeInTheDocument();
  });

  it('switches between Pulse, Ads, Cohorts, and Funnel tabs', () => {
    renderWithIntl(<ProductDemoShowcase />);

    const adsTabBtn = screen.getByRole('button', { name: /Ad Cockpit|קוקפיט מודעות/i });
    fireEvent.click(adsTabBtn);
    expect(screen.getByText(/US-Search-High-Intent-SaaS/)).toBeInTheDocument();

    const cohortsTabBtn = screen.getByRole('button', { name: /Cohort Breakeven|שימור ואיזון/i });
    fireEvent.click(cohortsTabBtn);
    expect(screen.getByText(/CAC Payback %/i)).toBeInTheDocument();

    const funnelTabBtn = screen.getByRole('button', { name: /Conversion Funnel|משפך המרות/i });
    fireEvent.click(funnelTabBtn);
    expect(screen.getByText(/Optimization Insight/i)).toBeInTheDocument();
  });

  it('allows toggling campaign status in the Ad Cockpit table', () => {
    renderWithIntl(<ProductDemoShowcase />);

    const adsTabBtn = screen.getByRole('button', { name: /Ad Cockpit|קוקפיט מודעות/i });
    fireEvent.click(adsTabBtn);

    const pauseButtons = screen.getAllByRole('button', { name: /Pause/i });
    fireEvent.click(pauseButtons[0]);

    expect(screen.getAllByRole('button', { name: /Run/i }).length).toBeGreaterThan(0);
  });
});
