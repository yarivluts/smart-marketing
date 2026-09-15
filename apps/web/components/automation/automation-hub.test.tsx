import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { AutomationHub } from './automation-hub';

describe('AutomationHub Component', () => {
  it('renders automation hub with tabs, header, and stats', () => {
    renderWithIntl(
      <AutomationHub
        orgId="org-1"
        projectId="proj-1"
        projectName="EasySign SaaS"
      />,
      { locale: 'en' },
    );

    expect(screen.getByTestId('action-hub')).toBeInTheDocument();
    expect(screen.getByText('AI Automation Hub')).toBeInTheDocument();
    expect(screen.getByText(/Autonomous marketing execution/)).toBeInTheDocument();
    expect(screen.getByText('AI Copilot & Proposals')).toBeInTheDocument();
    expect(screen.getByText('Audit Trail')).toBeInTheDocument();
  });

  it('displays kill switch badge when killSwitchEngaged is true', () => {
    renderWithIntl(
      <AutomationHub
        orgId="org-1"
        projectId="proj-1"
        killSwitchEngaged={true}
      />,
      { locale: 'en' },
    );

    expect(screen.getByTestId('kill-switch-active-badge')).toBeInTheDocument();
    expect(screen.getByText('KILL SWITCH ACTIVE')).toBeInTheDocument();
  });

  /**
   * The hub used to seed its proposal state with two invented budget changes — "Meta
   * Retargeting Leads", $150/day -> $250/day, "+32% projected conversions (ROAS 4.2x)" —
   * whenever no real proposals were passed, and render an Approve button beside them. A
   * project with nothing pending therefore showed fabricated recommendations that read
   * exactly like real ones. These three tests pin that every figure on the page comes from
   * the props.
   */
  it('renders no proposals at all when none are supplied, instead of inventing them', () => {
    renderWithIntl(
      <AutomationHub orgId="org-1" projectId="proj-1" proposals={[]} />,
      { locale: 'en' },
    );

    expect(screen.queryByText(/Meta Retargeting Leads/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Google Brand Search/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$150\/day/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ROAS 4\.2x/)).not.toBeInTheDocument();
  });

  it('shows no invented spend figure or change-vs-last-week badge', () => {
    renderWithIntl(
      <AutomationHub orgId="org-1" projectId="proj-1" />,
      { locale: 'en' },
    );

    expect(screen.queryByText('$14,850')).not.toBeInTheDocument();
    expect(screen.queryByText(/AI-Optimized Spend/)).not.toBeInTheDocument();
    expect(screen.queryByText(/vs last week/)).not.toBeInTheDocument();
    expect(screen.queryByText('12.5')).not.toBeInTheDocument();
    expect(screen.queryByText('24.2')).not.toBeInTheDocument();
  });

  it('counts pending proposals from the supplied data', () => {
    renderWithIntl(
      <AutomationHub
        orgId="org-1"
        projectId="proj-1"
        proposals={[
          {
            id: 'p-1',
            targetId: 'tgt-1',
            targetLabel: 'Real Campaign',
            actionType: 'budget_change',
            platform: 'meta_ads',
            impactBadge: 'high',
            diffEntries: [{ key: 'Daily Budget', before: '$10/day', after: '$20/day' }],
            status: 'awaiting_approval',
          },
        ]}
      />,
      { locale: 'en' },
    );

    expect(screen.getByText('Real Campaign')).toBeInTheDocument();
    expect(screen.getByText('Pending Proposals')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('switches between Copilot & Audit Trail tabs smoothly', () => {
    renderWithIntl(
      <AutomationHub
        orgId="org-1"
        projectId="proj-1"
      />,
      { locale: 'en' },
    );

    // Switch to Audit Trail tab
    const auditTab = screen.getByRole('tab', { name: /Audit Trail/i });
    fireEvent.click(auditTab);

    expect(screen.getByTestId('audit-trail-container')).toBeInTheDocument();
  });
});
