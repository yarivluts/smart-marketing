import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AutomationProposeAdCreativeEditForm } from './automation-propose-ad-creative-edit-form';
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
      <AutomationProposeAdCreativeEditForm orgId="org-1" projectId="project-1" targets={targets} />
    </NextIntlClientProvider>,
  );
}

function lastRequestBody(): unknown {
  const call = vi.mocked(fetch).mock.calls[0];
  return JSON.parse(String((call[1] as RequestInit).body));
}

describe('AutomationProposeAdCreativeEditForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows the no-targets note when no target has an ad yet', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AutomationProposeAdCreativeEditForm orgId="org-1" projectId="project-1" targets={[]} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText(/create and execute a campaign draft/)).toBeInTheDocument();
  });

  it('submits an ad creative edit for the selected target and ad', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    expect(screen.getByLabelText('Ad')).toHaveValue('act_999/ads/1');
    fireEvent.change(screen.getByLabelText('New primary text'), { target: { value: 'Even bigger savings.' } });
    fireEvent.change(screen.getByLabelText('New headline'), { target: { value: 'Blue Widgets Mega Sale' } });
    fireEvent.change(screen.getByLabelText('New description (optional)'), { target: { value: 'Now 30% off.' } });
    fireEvent.change(screen.getByLabelText('New link URL'), { target: { value: 'https://example.com/mega-sale' } });

    fireEvent.click(screen.getByRole('button', { name: 'Propose ad creative edit' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = lastRequestBody() as {
      targetId: string;
      adResourceName: string;
      creative: { primaryText: string; headline: string; description?: string; linkUrl: string; imageDataUrl?: string };
    };
    expect(body.targetId).toBe('target-1');
    expect(body.adResourceName).toBe('act_999/ads/1');
    expect(body.creative).toEqual({
      primaryText: 'Even bigger savings.',
      headline: 'Blue Widgets Mega Sale',
      description: 'Now 30% off.',
      linkUrl: 'https://example.com/mega-sale',
    });
  });

  it('omits description when left blank', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('New primary text'), { target: { value: 'Even bigger savings.' } });
    fireEvent.change(screen.getByLabelText('New headline'), { target: { value: 'Blue Widgets Mega Sale' } });
    fireEvent.change(screen.getByLabelText('New link URL'), { target: { value: 'https://example.com/mega-sale' } });
    fireEvent.click(screen.getByRole('button', { name: 'Propose ad creative edit' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = lastRequestBody() as { creative: { description?: string } };
    expect(body.creative.description).toBeUndefined();
  });

  it('lets the ad selection change independently for the same target', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Ad'), { target: { value: 'act_999/ads/2' } });
    fireEvent.change(screen.getByLabelText('New primary text'), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText('New headline'), { target: { value: 'B' } });
    fireEvent.change(screen.getByLabelText('New link URL'), { target: { value: 'https://example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Propose ad creative edit' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = lastRequestBody() as { adResourceName: string };
    expect(body.adResourceName).toBe('act_999/ads/2');
  });

  it('shows an inline error and does not submit when primary text/headline/link URL are empty', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Propose ad creative edit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter primary text, a headline, and a link URL.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('New primary text'), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText('New headline'), { target: { value: 'B' } });
    fireEvent.change(screen.getByLabelText('New link URL'), { target: { value: 'https://example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Propose ad creative edit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't propose the ad creative edit. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it('rejects a too-large image before submitting', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('New primary text'), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText('New headline'), { target: { value: 'B' } });
    fireEvent.change(screen.getByLabelText('New link URL'), { target: { value: 'https://example.com' } });

    const bigFile = new File([new Uint8Array(400_001)], 'big.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/New ad creative image/), { target: { files: [bigFile] } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Image must be 390KB or smaller.');
    expect(fetch).not.toHaveBeenCalled();
  });
});
