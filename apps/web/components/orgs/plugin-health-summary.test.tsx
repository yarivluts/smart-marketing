import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { PluginHealthSummary } from './plugin-health-summary';
import type { PluginInstallHealth } from '@/lib/orgs/plugin-view';
import messages from '../../messages/en.json';

function renderHealth(health: PluginInstallHealth): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PluginHealthSummary health={health} />
    </NextIntlClientProvider>,
  );
}

describe('PluginHealthSummary', () => {
  it('shows "Healthy" plus the last-succeeded time when the most recent run succeeded', () => {
    renderHealth({ status: 'healthy', latestRun: null, lastSucceededAt: '2026-01-02T00:05:00.000Z' });
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('Last succeeded 2026-01-02T00:05:00.000Z')).toBeInTheDocument();
  });

  it('shows "Degraded" with no last-succeeded time when the plugin has never succeeded', () => {
    renderHealth({ status: 'degraded', latestRun: null, lastSucceededAt: null });
    expect(screen.getByText('Degraded')).toBeInTheDocument();
    expect(screen.queryByText(/Last succeeded/)).not.toBeInTheDocument();
  });

  it('shows "Never run" for a source install with no run history yet', () => {
    renderHealth({ status: 'neverRun', latestRun: null, lastSucceededAt: null });
    expect(screen.getByText('Never run')).toBeInTheDocument();
  });

  it("reuses the existing status label for a non-source install's status-based health", () => {
    renderHealth({ status: 'disabled', latestRun: null, lastSucceededAt: null });
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });
});
