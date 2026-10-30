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
});
