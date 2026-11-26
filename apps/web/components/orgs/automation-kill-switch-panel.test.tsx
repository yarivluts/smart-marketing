import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it.each([
    ['en', enMessages],
    ['he', heMessages],
  ] as const)('does not end on a dangling colon when no reason was saved (%s)', (locale, messages) => {
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <AutomationKillSwitchPanel orgId="o1" status={{ engaged: true, reason: '  ' } as never} canManage={false} />
      </NextIntlClientProvider>,
    );
    const note = screen.getByText(messages.Automation.killSwitchEngagedNoReasonNote);
    expect(note.textContent?.trim().endsWith(':')).toBe(false);
  });

  it.each([
    ['server error', () => Promise.resolve({ ok: false } as Response)],
    ['dropped connection', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('says automation is still running when pausing fails (%s)', async (_label, respond) => {
    vi.stubGlobal('fetch', vi.fn(respond));
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <AutomationKillSwitchPanel orgId="o1" status={{ engaged: false } as never} />
      </NextIntlClientProvider>,
    );
    fireEvent.change(screen.getByLabelText(enMessages.Automation.killSwitchReasonLabel), { target: { value: 'Audit' } });
    fireEvent.click(screen.getByRole('button', { name: enMessages.Automation.killSwitchEngageButton }));
    expect(await screen.findByRole('alert')).toHaveTextContent(enMessages.Automation.killSwitchEngageError);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: enMessages.Automation.killSwitchEngageButton })).not.toBeDisabled(),
    );
  });

  it('says automation is still paused when resuming fails on a dropped connection', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <AutomationKillSwitchPanel orgId="o1" status={{ engaged: true, reason: 'Audit' } as never} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: enMessages.Automation.killSwitchDisengageButton }));
    expect(await screen.findByRole('alert')).toHaveTextContent(enMessages.Automation.killSwitchError);
  });

  it('has Hebrew copy for both failure messages', () => {
    expect(heMessages.Automation.killSwitchEngageError).toBeTruthy();
    expect(heMessages.Automation.killSwitchError).toContain('מושהית');
  });
});
