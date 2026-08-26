import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AutomationProposeMetaAdSetTargetingEditForm } from './automation-propose-meta-ad-set-targeting-edit-form';
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
      <AutomationProposeMetaAdSetTargetingEditForm orgId="org-1" projectId="project-1" targets={targets} />
    </NextIntlClientProvider>,
  );
}

function lastRequestBody(): unknown {
  const call = vi.mocked(fetch).mock.calls[0];
  return JSON.parse(String((call[1] as RequestInit).body));
}

describe('AutomationProposeMetaAdSetTargetingEditForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows the no-targets note when no target has an ad set yet', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AutomationProposeMetaAdSetTargetingEditForm orgId="org-1" projectId="project-1" targets={[]} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText(/create and execute a campaign draft/)).toBeInTheDocument();
  });

  it('submits the full targeting spec for the selected target and ad set', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    expect(screen.getByLabelText('Ad set')).toHaveValue('act_999/adsets/1');
    fireEvent.change(screen.getByLabelText('Countries (ISO codes, one per line)'), { target: { value: 'US\nCA' } });
    fireEvent.change(screen.getByLabelText('Minimum age'), { target: { value: '21' } });
    fireEvent.change(screen.getByLabelText('Maximum age'), { target: { value: '45' } });
    fireEvent.click(screen.getByLabelText('Female'));

    fireEvent.click(screen.getByRole('button', { name: 'Propose ad set targeting edit' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = lastRequestBody() as {
      targetId: string;
      adSetResourceName: string;
      targeting: { countries: string[]; ageMin: number; ageMax: number; genders?: string[] };
    };
    expect(body.targetId).toBe('target-1');
    expect(body.adSetResourceName).toBe('act_999/adsets/1');
    expect(body.targeting).toEqual({ countries: ['US', 'CA'], ageMin: 21, ageMax: 45, genders: ['female'] });
  });

  it('omits genders entirely when neither checkbox is checked (all genders)', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Countries (ISO codes, one per line)'), { target: { value: 'US' } });
    fireEvent.click(screen.getByRole('button', { name: 'Propose ad set targeting edit' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = lastRequestBody() as { targeting: { genders?: string[] } };
    expect(body.targeting.genders).toBeUndefined();
  });

  it('lets the ad set selection change independently for the same target', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Ad set'), { target: { value: 'act_999/adsets/2' } });
    fireEvent.change(screen.getByLabelText('Countries (ISO codes, one per line)'), { target: { value: 'US' } });
    fireEvent.click(screen.getByRole('button', { name: 'Propose ad set targeting edit' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = lastRequestBody() as { adSetResourceName: string };
    expect(body.adSetResourceName).toBe('act_999/adsets/2');
  });

  it('shows an inline error and does not submit when countries is empty', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Propose ad set targeting edit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter at least one country code.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an inline error and does not submit when the min age exceeds the max age', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Countries (ISO codes, one per line)'), { target: { value: 'US' } });
    fireEvent.change(screen.getByLabelText('Minimum age'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Maximum age'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Propose ad set targeting edit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid age range (min age must not exceed max age).');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Countries (ISO codes, one per line)'), { target: { value: 'US' } });
    fireEvent.click(screen.getByRole('button', { name: 'Propose ad set targeting edit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't propose the ad set targeting edit. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
