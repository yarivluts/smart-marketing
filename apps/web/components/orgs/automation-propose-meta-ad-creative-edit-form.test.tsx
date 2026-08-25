import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AutomationProposeMetaAdCreativeEditForm } from './automation-propose-meta-ad-creative-edit-form';
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
    metaAdResourceNames: ['act_999/ads/1', 'act_999/ads/2'],
  },
];

function renderForm(targets: AutomationTargetView[] = TARGETS): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AutomationProposeMetaAdCreativeEditForm orgId="org-1" projectId="project-1" targets={targets} />
    </NextIntlClientProvider>,
  );
}

function lastRequestBody(): unknown {
  const call = vi.mocked(fetch).mock.calls[0];
  return JSON.parse(String((call[1] as RequestInit).body));
}

describe('AutomationProposeMetaAdCreativeEditForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows the no-targets note when no target has an ad yet', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AutomationProposeMetaAdCreativeEditForm orgId="org-1" projectId="project-1" targets={[]} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText(/create and execute a campaign draft/)).toBeInTheDocument();
  });

  it('submits a creative edit for the selected target and ad', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    expect(screen.getByLabelText('Ad')).toHaveValue('act_999/ads/1');
    fireEvent.change(screen.getByLabelText('Link URL'), { target: { value: 'https://example.com/widgets' } });
    fireEvent.change(screen.getByLabelText('Primary text'), { target: { value: 'Even bigger savings.' } });
    fireEvent.change(screen.getByLabelText('Headline'), { target: { value: 'Blue Widgets Mega Sale' } });
    fireEvent.change(screen.getByLabelText('Description (optional)'), { target: { value: 'Shop now' } });

    fireEvent.click(screen.getByRole('button', { name: 'Propose ad creative edit' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = lastRequestBody() as {
      targetId: string;
      adResourceName: string;
      primaryText: string;
      headline: string;
      description?: string;
      linkUrl: string;
    };
    expect(body.targetId).toBe('target-1');
    expect(body.adResourceName).toBe('act_999/ads/1');
    expect(body.primaryText).toBe('Even bigger savings.');
    expect(body.headline).toBe('Blue Widgets Mega Sale');
    expect(body.description).toBe('Shop now');
    expect(body.linkUrl).toBe('https://example.com/widgets');
  });

  it('omits description from the request when left blank', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Link URL'), { target: { value: 'https://example.com/widgets' } });
    fireEvent.change(screen.getByLabelText('Primary text'), { target: { value: 'Even bigger savings.' } });
    fireEvent.change(screen.getByLabelText('Headline'), { target: { value: 'Blue Widgets Mega Sale' } });
    fireEvent.click(screen.getByRole('button', { name: 'Propose ad creative edit' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = lastRequestBody() as { description?: string };
    expect('description' in body).toBe(false);
  });

  it('lets the ad selection change independently for the same target', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Ad'), { target: { value: 'act_999/ads/2' } });
    fireEvent.change(screen.getByLabelText('Link URL'), { target: { value: 'https://example.com/widgets' } });
    fireEvent.change(screen.getByLabelText('Primary text'), { target: { value: 'Even bigger savings.' } });
    fireEvent.change(screen.getByLabelText('Headline'), { target: { value: 'Blue Widgets Mega Sale' } });
    fireEvent.click(screen.getByRole('button', { name: 'Propose ad creative edit' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = lastRequestBody() as { adResourceName: string };
    expect(body.adResourceName).toBe('act_999/ads/2');
  });

  it('shows an inline error and does not submit when primary text, headline, or link URL is missing', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Propose ad creative edit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter primary text, a headline, and a link URL.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Link URL'), { target: { value: 'https://example.com/widgets' } });
    fireEvent.change(screen.getByLabelText('Primary text'), { target: { value: 'Even bigger savings.' } });
    fireEvent.change(screen.getByLabelText('Headline'), { target: { value: 'Blue Widgets Mega Sale' } });
    fireEvent.click(screen.getByRole('button', { name: 'Propose ad creative edit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't propose the ad creative edit. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
