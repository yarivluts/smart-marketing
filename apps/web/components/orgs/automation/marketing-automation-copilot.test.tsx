import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MarketingAutomationCopilot, type SerializedAutomationAction } from './marketing-automation-copilot';
import messages from '../../../messages/en.json';

const mockActions: SerializedAutomationAction[] = [
  {
    id: 'aa-001',
    actionType: 'budget_change',
    targetLabel: 'Google Search — High Intent',
    status: 'executed',
    impact: '+3,528 projected return',
    proposedAt: '2026-08-24T08:30:00Z',
  },
];

describe('MarketingAutomationCopilot', () => {
  it('renders autonomous marketing copilot with status and launchpad', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MarketingAutomationCopilot projectName="EasySign Growth" actions={mockActions} />
      </NextIntlClientProvider>,
    );

    // Header
    expect(
      screen.getByRole('heading', { name: 'Autonomous Marketing Copilot (EasySign Growth)' }),
    ).toBeInTheDocument();

    // Status
    expect(screen.getByText('Copilot Active & Guarded')).toBeInTheDocument();

    // 1-Click Launchpad packs
    expect(screen.getByText('High-Intent Search Pack')).toBeInTheDocument();
    expect(screen.getByText('Video & Retargeting Pack')).toBeInTheDocument();
    expect(screen.getByText('Performance Max Omnichannel')).toBeInTheDocument();

    // Safety guardrails
    expect(screen.getByText('Minimum ROAS Floor Safeguard')).toBeInTheDocument();
    expect(screen.getByText('2.0x ROAS')).toBeInTheDocument();

    // Action from DB
    expect(screen.getByText('Google Search — High Intent')).toBeInTheDocument();
    expect(screen.getByText('+3,528 projected return')).toBeInTheDocument();
  });

  it('allows toggling copilot active status', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MarketingAutomationCopilot projectName="EasySign Growth" actions={[]} />
      </NextIntlClientProvider>,
    );

    const toggleBtn = screen.getByRole('button', { name: /Pause Automation/i });
    fireEvent.click(toggleBtn);
    expect(screen.getByText('Copilot Paused')).toBeInTheDocument();
  });
});

