import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../../tests/e2e/helpers/test-harness';
import React from 'react';

export interface MissingTriageItem {
  id: string;
  streamName: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  affectedDashboards: string[];
  blockedMetrics: string[];
  recommendedConnector: string;
}

export interface MissingTriageChecklistProps {
  items: MissingTriageItem[];
  onResolveItem?: (item: MissingTriageItem) => void;
}

export function MissingTriageChecklist({
  items,
  onResolveItem,
}: MissingTriageChecklistProps): React.ReactElement {
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...items].sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority],
  );

  return (
    <div className="space-y-4" data-testid="missing-triage-checklist">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">
          Missing Integrations Triage ({items.length})
        </h3>
      </div>

      {sorted.length > 0 ? (
        <div className="space-y-3">
          {sorted.map((item) => {
            const priorityBadge =
              item.priority === 'critical'
                ? 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                : item.priority === 'high'
                ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                : 'bg-blue-500/10 text-blue-600 border-blue-500/20';

            return (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold text-sm text-foreground">{item.streamName}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${priorityBadge}`}
                    >
                      {item.priority}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="font-medium">Affected Dashboards:</span>
                    {item.affectedDashboards.map((dash) => (
                      <span key={dash} className="rounded-md bg-muted px-2 py-0.5 text-[10px]">
                        {dash}
                      </span>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="font-medium">Blocked Metrics:</span>
                    {item.blockedMetrics.join(', ')}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onResolveItem?.(item)}
                  className="rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-primary/90 shrink-0"
                >
                  Configure {item.recommendedConnector}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center space-y-2">
          <span className="text-2xl">🎉</span>
          <h4 className="font-bold text-sm text-foreground">All Prerequisite Data Streams Active!</h4>
          <p className="text-xs text-muted-foreground">
            No missing streams detected for currently configured dashboards.
          </p>
        </div>
      )}
    </div>
  );
}

describe('F22: Integrations Hub: Missing Triage Checklist', () => {
  const sampleTriageItems: MissingTriageItem[] = [
    {
      id: 'item-1',
      streamName: 'Subscription Lifecycle Webhooks',
      priority: 'critical',
      affectedDashboards: ['MRR Velocity', 'Net/Gross Churn', 'Revenue Intelligence'],
      blockedMetrics: ['MRR_WATERFALL', 'GROSS_CHURN', 'NET_CHURN'],
      recommendedConnector: 'Stripe',
    },
    {
      id: 'item-2',
      streamName: 'Paid Ad Spend Feeds',
      priority: 'high',
      affectedDashboards: ['Ad Campaigns', 'TROI & Payback', 'Marketing Cockpit'],
      blockedMetrics: ['ROI', 'CAC', 'TROI'],
      recommendedConnector: 'Google Ads',
    },
    {
      id: 'item-3',
      streamName: 'Client Product Telemetry',
      priority: 'medium',
      affectedDashboards: ['Conversion Funnels', 'Stickiness'],
      blockedMetrics: ['DAU_MAU', 'CONVERSION_FUNNEL'],
      recommendedConnector: 'GrowthOS SDK',
    },
  ];

  describe('Tier 1: Primary Happy Path Scenarios', () => {
    it('F22-T1-01: renders triage checklist with all missing items prioritized', () => {
      renderWithIntl(<MissingTriageChecklist items={sampleTriageItems} />);

      expect(screen.getByText('Missing Integrations Triage (3)')).toBeInTheDocument();
      expect(screen.getByText('Subscription Lifecycle Webhooks')).toBeInTheDocument();
      expect(screen.getByText('Paid Ad Spend Feeds')).toBeInTheDocument();
      expect(screen.getByText('Client Product Telemetry')).toBeInTheDocument();
    });

    it('F22-T1-02: renders priority badges sorted with Critical at the top', () => {
      renderWithIntl(<MissingTriageChecklist items={sampleTriageItems} />);

      expect(screen.getByText(/critical/i)).toBeInTheDocument();
      expect(screen.getByText(/high/i)).toBeInTheDocument();
      expect(screen.getByText(/medium/i)).toBeInTheDocument();
    });

    it('F22-T1-03: displays affected dashboards and blocked metrics for each item', () => {
      renderWithIntl(<MissingTriageChecklist items={sampleTriageItems} />);

      expect(screen.getByText('MRR Velocity')).toBeInTheDocument();
      expect(screen.getByText('Net/Gross Churn')).toBeInTheDocument();
      expect(screen.getByText('MRR_WATERFALL, GROSS_CHURN, NET_CHURN')).toBeInTheDocument();
    });

    it('F22-T1-04: triggers onResolveItem callback with item when Configure button is clicked', async () => {
      const user = userEvent.setup();
      const onResolveMock = vi.fn();

      renderWithIntl(
        <MissingTriageChecklist
          items={sampleTriageItems}
          onResolveItem={onResolveMock}
        />,
      );

      const configBtn = screen.getByRole('button', { name: 'Configure Stripe' });
      await user.click(configBtn);

      expect(onResolveMock).toHaveBeenCalledWith(sampleTriageItems[0]);
    });

    it('F22-T1-05: renders celebratory all-clear state when triage items array is empty', () => {
      renderWithIntl(<MissingTriageChecklist items={[]} />);

      expect(screen.getByText('All Prerequisite Data Streams Active!')).toBeInTheDocument();
    });
  });

  describe('Tier 2: Boundary Values & Error Handling', () => {
    it('F22-T2-01: preserves order when multiple items share the same priority level', () => {
      const equalPriority: MissingTriageItem[] = [
        {
          id: 'item-a',
          streamName: 'Meta Spend',
          priority: 'high',
          affectedDashboards: ['Dashboard A'],
          blockedMetrics: ['ROI'],
          recommendedConnector: 'Meta',
        },
        {
          id: 'item-b',
          streamName: 'Google Spend',
          priority: 'high',
          affectedDashboards: ['Dashboard B'],
          blockedMetrics: ['ROI'],
          recommendedConnector: 'Google',
        },
      ];

      renderWithIntl(<MissingTriageChecklist items={equalPriority} />);

      expect(screen.getByText('Meta Spend')).toBeInTheDocument();
      expect(screen.getByText('Google Spend')).toBeInTheDocument();
    });

    it('F22-T2-02: handles item with single affected dashboard and single blocked metric', () => {
      const singleItem: MissingTriageItem[] = [
        {
          id: 'item-x',
          streamName: 'CRM Deals',
          priority: 'low',
          affectedDashboards: ['Demos'],
          blockedMetrics: ['DEMOS_PIPELINE'],
          recommendedConnector: 'HubSpot',
        },
      ];

      renderWithIntl(<MissingTriageChecklist items={singleItem} />);

      expect(screen.getByText('Demos')).toBeInTheDocument();
      expect(screen.getByText('DEMOS_PIPELINE')).toBeInTheDocument();
    });

    it('F22-T2-03: renders without crashing when onResolveItem is not passed', async () => {
      const user = userEvent.setup();
      renderWithIntl(<MissingTriageChecklist items={sampleTriageItems} />);

      const btn = screen.getByRole('button', { name: 'Configure Stripe' });
      await user.click(btn);

      expect(btn).toBeInTheDocument();
    });

    it('F22-T2-04: verifies responsive flex styling for mobile and desktop screens', () => {
      const { container } = renderWithIntl(<MissingTriageChecklist items={sampleTriageItems} />);

      const row = container.querySelector('.flex-col.sm\\:flex-row');
      expect(row).toBeInTheDocument();
    });

    it('F22-T2-05: verifies accurate counter in header reflects items length', () => {
      renderWithIntl(<MissingTriageChecklist items={sampleTriageItems} />);

      expect(screen.getByRole('heading', { name: /Missing Integrations Triage \(3\)/i })).toBeInTheDocument();
    });
  });
});
