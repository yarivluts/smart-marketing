import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { createTranslator } from 'next-intl';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';
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
    expect(screen.getByText('AI helper and approvals')).toBeInTheDocument();
    expect(screen.getByText(/Changes the AI suggests for/)).toBeInTheDocument();
    expect(screen.getByText('AI helper and suggestions')).toBeInTheDocument();
    expect(screen.getByText('Change history')).toBeInTheDocument();
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
    expect(screen.getByText('Emergency stop is on - nothing changes automatically')).toBeInTheDocument();
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
    const auditTab = screen.getByRole('tab', { name: /Change history/i });
    fireEvent.click(auditTab);

    expect(screen.getByTestId('audit-trail-container')).toBeInTheDocument();
  });

  it('renders its Hebrew copy from he.json', () => {
    const t = createTranslator({ locale: 'he', messages: heMessages, namespace: 'AutomationHub' });
    renderWithIntl(
      <AutomationHub
        orgId="org-1"
        projectId="proj-1"
        projectName="EasySign SaaS"
        killSwitchEngaged={true}
        proposals={[
          {
            id: 'p-1',
            targetId: 'tgt-1',
            targetLabel: 'Real Campaign',
            actionType: 'budget_change',
            status: 'awaiting_approval',
          },
        ]}
      />,
      { locale: 'he' },
    );

    expect(screen.getByTestId('action-hub')).toHaveAttribute('dir', 'rtl');
    expect(screen.getByText(t('title'))).toBeInTheDocument();
    expect(screen.getByText(t('killSwitchActive'))).toBeInTheDocument();
    expect(screen.getByText(t('description', { projectName: 'EasySign SaaS' }))).toBeInTheDocument();
    expect(screen.getByText(t('pendingProposals'))).toBeInTheDocument();
    expect(screen.getByText(t('pendingCount', { count: 1 }))).toBeInTheDocument();
    expect(screen.getByText(t('tabCopilot'))).toBeInTheDocument();
  });


  it.each(['en', 'he'] as const)('keeps product jargon out of the helper and hub copy in %s', (locale) => {
    const m = locale === 'en' ? enMessages : heMessages;
    const text = [...Object.values(m.AutomationHub), m.CopilotChatPanel.welcomeMessage, m.Copilot.drawerTitle, m.Copilot.drawerSubtitle, m.Copilot.emptyTitle, m.Copilot.emptySubtitle, m.Automation.killSwitchEngagedBadge].join(' | ');
    expect(text).not.toMatch(/copilot|kill switch|guardrail|autonomous|rollback|hybrid|reallocation/i);
  });

  it('keeps the old Hebrew pilot wording and the engine badge out of the helper header', () => {
    expect(heMessages.Copilot.drawerTitle).not.toMatch(/טייס/);
    expect(heMessages.Copilot.drawerSubtitle).not.toMatch(/טייס|תובנות/);
    expect(heMessages.Copilot).not.toHaveProperty('badgeHybridEngine');
    expect(enMessages.Copilot).not.toHaveProperty('badgeHybridEngine');
  });
});
