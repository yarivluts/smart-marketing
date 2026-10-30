import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '../../messages/en.json';
import heMessages from '../../messages/he.json';
import { AutomationKillSwitchPanel } from './automation-kill-switch-panel';

vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe('AutomationKillSwitchPanel', () => {
  it('explains what pausing does and gives an example reason', () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <AutomationKillSwitchPanel orgId="o1" status={{ engaged: false } as never} />
      </NextIntlClientProvider>,
    );
    const field = screen.getByLabelText(enMessages.Automation.killSwitchReasonLabel);
    expect(field).toHaveAttribute('placeholder', enMessages.Automation.killSwitchReasonPlaceholder);
    expect(field).toHaveAccessibleDescription(enMessages.Automation.killSwitchReasonHint);
  });

  it('has Hebrew copy for the new text', () => {
    expect(heMessages.Automation.killSwitchReasonHint).toBeTruthy();
    expect(heMessages.Automation.killSwitchReasonPlaceholder).toBeTruthy();
  });

  it('renders a read-only status note without engage/disengage controls when canManage is false', () => {
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <AutomationKillSwitchPanel orgId="o1" status={{ engaged: false } as never} canManage={false} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(enMessages.Automation.killSwitchDisengagedNote)).toBeInTheDocument();
    expect(screen.queryByLabelText(enMessages.Automation.killSwitchReasonLabel)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: enMessages.Automation.killSwitchEngageButton })).not.toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <AutomationKillSwitchPanel
          orgId="o1"
          status={{ engaged: true, reason: 'Billing audit' } as never}
          canManage={false}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(/Billing audit/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: enMessages.Automation.killSwitchDisengageButton })).not.toBeInTheDocument();
  });
});
