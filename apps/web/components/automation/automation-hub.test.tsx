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
