import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AutomationProposeKeywordEditForm } from './automation-propose-keyword-edit-form';
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
    adGroupResourceNames: ['customers/999/adGroups/1', 'customers/999/adGroups/2'],
  },
];

function renderForm(targets: AutomationTargetView[] = TARGETS): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AutomationProposeKeywordEditForm orgId="org-1" projectId="project-1" targets={targets} />
    </NextIntlClientProvider>,
  );
}

function lastRequestBody(): unknown {
  const call = vi.mocked(fetch).mock.calls[0];
  return JSON.parse(String((call[1] as RequestInit).body));
}

describe('AutomationProposeKeywordEditForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows the no-targets note when no target has an ad group yet', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AutomationProposeKeywordEditForm orgId="org-1" projectId="project-1" targets={[]} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText(/create and execute a campaign draft/)).toBeInTheDocument();
  });

  it('submits an add-keywords edit for the selected target and ad group', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    expect(screen.getByLabelText('Ad group')).toHaveValue('customers/999/adGroups/1');
    fireEvent.change(screen.getByLabelText(/^Keywords to add/), { target: { value: 'blue widgets\ncheap widgets' } });
    fireEvent.change(screen.getByLabelText(/^Negative keywords to add/), { target: { value: 'free' } });

    fireEvent.click(screen.getByRole('button', { name: 'Propose keyword edit' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = lastRequestBody() as {
      targetId: string;
      adGroupResourceName: string;
      addKeywords: Array<{ text: string; matchType: string }>;
      addNegativeKeywords: Array<{ text: string; matchType: string }>;
    };
    expect(body.targetId).toBe('target-1');
    expect(body.adGroupResourceName).toBe('customers/999/adGroups/1');
    expect(body.addKeywords).toEqual([
      { text: 'blue widgets', matchType: 'PHRASE' },
      { text: 'cheap widgets', matchType: 'PHRASE' },
    ]);
    expect(body.addNegativeKeywords).toEqual([{ text: 'free', matchType: 'BROAD' }]);
  });

  it('lets the ad group selection change independently for the same target', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Ad group'), { target: { value: 'customers/999/adGroups/2' } });
    fireEvent.change(screen.getByLabelText(/^Keywords to add/), { target: { value: 'blue widgets' } });
    fireEvent.click(screen.getByRole('button', { name: 'Propose keyword edit' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = lastRequestBody() as { adGroupResourceName: string };
    expect(body.adGroupResourceName).toBe('customers/999/adGroups/2');
  });

  it('shows an inline error and does not submit when both keyword fields are empty', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Propose keyword edit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter at least one keyword or negative keyword to add.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText(/^Keywords to add/), { target: { value: 'blue widgets' } });
    fireEvent.click(screen.getByRole('button', { name: 'Propose keyword edit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't propose the keyword edit. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
