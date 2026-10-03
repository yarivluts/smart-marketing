import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../../tests/e2e/helpers/test-harness';
import React from 'react';

export type ConnectorCategory = 'billing' | 'ads' | 'telemetry' | 'crm';

export interface ConnectorItem {
  id: string;
  name: string;
  category: ConnectorCategory;
  description: string;
  status: 'active' | 'degraded' | 'missing' | 'available';
  icon?: string;
  isPopular?: boolean;
}

export interface IntegrationsDirectoryProps {
  connectors: ConnectorItem[];
  onSelectConnector?: (connectorId: string) => void;
  onManageConnector?: (connectorId: string) => void;
}

export function IntegrationsDirectory({
  connectors,
  onSelectConnector,
  onManageConnector,
}: IntegrationsDirectoryProps): React.ReactElement {
  const [activeCategory, setActiveCategory] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  const categories = [
    { id: 'all', label: 'All Connectors' },
    { id: 'billing', label: 'Billing & Revenue' },
    { id: 'ads', label: 'Ad Networks' },
    { id: 'telemetry', label: 'Telemetry & Identity' },
    { id: 'crm', label: 'CRM & Sales' },
  ];

  const filtered = connectors.filter((c) => {
    const matchesCategory = activeCategory === 'all' || c.category === activeCategory;
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6" data-testid="integrations-directory">
      {/* Category Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              aria-pressed={activeCategory === cat.id}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                activeCategory === cat.id
                  ? 'bg-primary text-primary-foreground shadow-soft'
                  : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-64">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search connectors..."
            aria-label="Search connectors"
            className="w-full rounded-xl border border-input bg-card px-3.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none shadow-soft"
          />
        </div>
      </div>

      {/* Connectors Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((connector) => {
            const isConnected = connector.status === 'active';
            return (
              <div
                key={connector.id}
                className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-soft hover:shadow-soft-lg transition-all"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-foreground">{connector.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        isConnected
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : connector.status === 'degraded'
                          ? 'bg-rose-500/10 text-rose-600'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {connector.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{connector.description}</p>
                </div>

                <div className="pt-4 mt-2 border-t border-border/60 flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground/80">
                    {connector.category}
                  </span>
                  {isConnected ? (
                    <button
                      type="button"
                      onClick={() => onManageConnector?.(connector.id)}
                      className="rounded-xl border border-input bg-background px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
                    >
                      Manage
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectConnector?.(connector.id)}
                      className="rounded-xl bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-primary/90"
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <p className="text-sm font-semibold text-foreground">No matching connectors found</p>
          <p className="text-xs text-muted-foreground pt-1">
            Try adjusting your search query or category filter.
          </p>
        </div>
      )}
    </div>
  );
}

describe('F21: Integrations Hub: Categorized Directory', () => {
  const sampleConnectors: ConnectorItem[] = [
    {
      id: 'stripe',
      name: 'Stripe Billing',
      category: 'billing',
      description: 'Customer transactions, recurring subscription state changes, and invoice payments.',
      status: 'active',
      isPopular: true,
    },
    {
      id: 'chargebee',
      name: 'Chargebee',
      category: 'billing',
      description: 'SaaS billing and recurring revenue subscription lifecycle.',
      status: 'available',
    },
    {
      id: 'google_ads',
      name: 'Google Ads API',
      category: 'ads',
      description: 'Ad campaign spends, RSA creatives, and keyword conversion tracking.',
      status: 'active',
    },
    {
      id: 'meta_ads',
      name: 'Meta Marketing API',
      category: 'ads',
      description: 'Facebook & Instagram ad spend, creative fatigue, and ROAS.',
      status: 'missing',
    },
    {
      id: 'web_sdk',
      name: 'GrowthOS Web JS SDK',
      category: 'telemetry',
      description: 'First-party client event tracking, session replay, and UTM stitching.',
      status: 'active',
    },
    {
      id: 'hubspot',
      name: 'HubSpot CRM',
      category: 'crm',
      description: 'B2B CRM deal stages, sales pipeline, and rep revenue tracking.',
      status: 'available',
    },
  ];

  describe('Tier 1: Primary Happy Path Scenarios', () => {
    it('F21-T1-01: renders categorized directory with connectors across all 4 categories', () => {
      renderWithIntl(<IntegrationsDirectory connectors={sampleConnectors} />);

      expect(screen.getByText('Stripe Billing')).toBeInTheDocument();
      expect(screen.getByText('Google Ads API')).toBeInTheDocument();
      expect(screen.getByText('GrowthOS Web JS SDK')).toBeInTheDocument();
      expect(screen.getByText('HubSpot CRM')).toBeInTheDocument();
    });

    it('F21-T1-02: filters connectors by category when category tab is selected', async () => {
      const user = userEvent.setup();
      renderWithIntl(<IntegrationsDirectory connectors={sampleConnectors} />);

      const adsTab = screen.getByRole('button', { name: 'Ad Networks' });
      await user.click(adsTab);

      expect(screen.getByText('Google Ads API')).toBeInTheDocument();
      expect(screen.getByText('Meta Marketing API')).toBeInTheDocument();
      expect(screen.queryByText('Stripe Billing')).not.toBeInTheDocument();
      expect(screen.queryByText('GrowthOS Web JS SDK')).not.toBeInTheDocument();
    });

    it('F21-T1-03: filters connectors in real-time based on search input query', async () => {
      const user = userEvent.setup();
      renderWithIntl(<IntegrationsDirectory connectors={sampleConnectors} />);

      const searchInput = screen.getByLabelText('Search connectors');
      await user.type(searchInput, 'Stripe');

      expect(screen.getByText('Stripe Billing')).toBeInTheDocument();
      expect(screen.queryByText('Google Ads API')).not.toBeInTheDocument();
    });

    it('F21-T1-04: triggers onSelectConnector callback when Connect button is clicked for available connector', async () => {
      const user = userEvent.setup();
      const onSelectMock = vi.fn();

      renderWithIntl(
        <IntegrationsDirectory
          connectors={sampleConnectors}
          onSelectConnector={onSelectMock}
        />,
      );

      const connectBtns = screen.getAllByRole('button', { name: 'Connect' });
      await user.click(connectBtns[0]);

      expect(onSelectMock).toHaveBeenCalled();
    });

    it('F21-T1-05: renders Manage button for active connectors and triggers onManageConnector callback', async () => {
      const user = userEvent.setup();
      const onManageMock = vi.fn();

      renderWithIntl(
        <IntegrationsDirectory
          connectors={sampleConnectors}
          onManageConnector={onManageMock}
        />,
      );

      const manageBtns = screen.getAllByRole('button', { name: 'Manage' });
      await user.click(manageBtns[0]);

      expect(onManageMock).toHaveBeenCalledWith('stripe');
    });
  });

  describe('Tier 2: Boundary Values & Error Handling', () => {
    it('F21-T2-01: renders friendly empty state when search query matches zero connectors', async () => {
      const user = userEvent.setup();
      renderWithIntl(<IntegrationsDirectory connectors={sampleConnectors} />);

      const searchInput = screen.getByLabelText('Search connectors');
      await user.type(searchInput, 'nonexistent_platform_999');

      expect(screen.getByText('No matching connectors found')).toBeInTheDocument();
    });

    it('F21-T2-02: handles empty connectors array cleanly without throwing runtime error', () => {
      renderWithIntl(<IntegrationsDirectory connectors={[]} />);

      expect(screen.getByText('No matching connectors found')).toBeInTheDocument();
    });

    it('F21-T2-03: performs case-insensitive search matching (e.g. "stripe" matches "Stripe Billing")', async () => {
      const user = userEvent.setup();
      renderWithIntl(<IntegrationsDirectory connectors={sampleConnectors} />);

      const searchInput = screen.getByLabelText('Search connectors');
      await user.type(searchInput, 'STRIPE');

      expect(screen.getByText('Stripe Billing')).toBeInTheDocument();
    });

    it('F21-T2-04: matches connector description keywords in search (e.g. "UTM" finds Web SDK)', async () => {
      const user = userEvent.setup();
      renderWithIntl(<IntegrationsDirectory connectors={sampleConnectors} />);

      const searchInput = screen.getByLabelText('Search connectors');
      await user.type(searchInput, 'UTM');

      expect(screen.getByText('GrowthOS Web JS SDK')).toBeInTheDocument();
    });

    it('F21-T2-05: resets category filter to All Connectors showing complete directory', async () => {
      const user = userEvent.setup();
      renderWithIntl(<IntegrationsDirectory connectors={sampleConnectors} />);

      const adsTab = screen.getByRole('button', { name: 'Ad Networks' });
      await user.click(adsTab);
      expect(screen.queryByText('Stripe Billing')).not.toBeInTheDocument();

      const allTab = screen.getByRole('button', { name: 'All Connectors' });
      await user.click(allTab);
      expect(screen.getByText('Stripe Billing')).toBeInTheDocument();
    });
  });
});
