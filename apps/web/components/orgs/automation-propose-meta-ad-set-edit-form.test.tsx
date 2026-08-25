import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AutomationProposeMetaAdSetEditForm } from './automation-propose-meta-ad-set-edit-form';
import type { AutomationTargetView } from '@/lib/orgs/automation-view';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const TARGETS: AutomationTargetView[] = [
  {
    id: 'target-1',
    targetType: 'campaign',
    label: 'Summer Sale',
    dailyBudgetUsd: 0,
    environmentId: 'live',
    metaAdSetResourceNames: ['act_999/adsets/1', 'act_999/adsets/2'],
  },
];

function renderForm(targets: AutomationTargetView[] = TARGETS): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AutomationProposeMetaAdSetEditForm orgId="org-1" projectId="project-1" targets={targets} />
    </NextIntlClientProvider>,
  );
}

function lastRequestBody(): unknown {
  const call = vi.mocked(fetch).mock.calls[0];
  return JSON.parse(String((call[1] as RequestInit).body));
}

describe('AutomationProposeMetaAdSetEditForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows the no-targets note when no target has an ad set yet', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AutomationProposeMetaAdSetEditForm orgId="org-1" projectId="project-1" targets={[]} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText(/create and execute a campaign draft/)).toBeInTheDocument();
  });

  it('submits a budget-only edit for the selected target and ad set', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    expect(screen.getByLabelText('Ad set')).toHaveValue('act_999/adsets/1');
    fireEvent.change(screen.getByLabelText('Daily budget (USD)'), { target: { value: '40' } });

    fireEvent.click(screen.getByRole('button', { name: 'Propose ad set edit' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = lastRequestBody() as { targetId: string; adSetResourceName: string; dailyBudgetUsd?: number; status?: string };
    expect(body.targetId).toBe('target-1');
    expect(body.adSetResourceName).toBe('act_999/adsets/1');
    expect(body.dailyBudgetUsd).toBe(40);
    expect(body.status).toBeUndefined();
  });

  it('submits a status-only edit, omitting dailyBudgetUsd', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'paused' } });
    fireEvent.click(screen.getByRole('button', { name: 'Propose ad set edit' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = lastRequestBody() as { dailyBudgetUsd?: number; status?: string };
    expect(body.dailyBudgetUsd).toBeUndefined();
    expect(body.status).toBe('paused');
  });

  it('lets the ad set selection change independently for the same target', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Ad set'), { target: { value: 'act_999/adsets/2' } });
    fireEvent.change(screen.getByLabelText('Daily budget (USD)'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Propose ad set edit' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = lastRequestBody() as { adSetResourceName: string };
    expect(body.adSetResourceName).toBe('act_999/adsets/2');
  });

  it('shows an inline error and does not submit when neither budget nor status is set', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Propose ad set edit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a daily budget or choose a new status.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an inline error and does not submit for a non-positive budget', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Daily budget (USD)'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Propose ad set edit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a positive daily budget.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Daily budget (USD)'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Propose ad set edit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't propose the ad set edit. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
