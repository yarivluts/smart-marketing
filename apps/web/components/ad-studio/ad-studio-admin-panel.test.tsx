import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { AdStudioAdminPanel, type AdStudioAdminPanelProps } from './ad-studio-admin-panel';

vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const PROPS: AdStudioAdminPanelProps = {
  orgId: 'o',
  projectId: 'p',
  canConfigure: false,
  textModel: { provider: 'gemini', model: 'gemini-3-pro-internal' },
  videoConfigured: true,
  keywordData: { available: false, reason: 'no_google_ads_credential' },
  storage: { kind: 'gcs', location: 'gs://growthos-media-internal' },
  ffmpegAvailable: true,
  limits: { dailyTextGenerations: 50, dailyVideoSeconds: 300, dailyImages: 40 },
  usageToday: { textGenerations: 3, videoSeconds: 16, images: 2 },
  recentUsage: [
    { id: 'u1', kind: 'script', provider: 'gemini', model: 'gemini-3-pro-internal', units: 1, outcome: 'succeeded', failureReason: null, occurredOn: '2026-10-02T10:49:00.000Z' },
    { id: 'u2', kind: 'video_scene', provider: 'gemini', model: 'veo-internal', units: 8, outcome: 'failed', failureReason: 'provider_billing', occurredOn: '2026-10-02T11:05:00.000Z' },
  ],
};

describe('AdStudioAdminPanel audiences (KAN-363)', () => {
  it('shows a customer the calls and where limits come from, without platform internals or a limits form', () => {
    const { container } = renderWithIntl(<AdStudioAdminPanel {...PROPS} />, { locale: 'en' });
    const text = container.textContent ?? '';
    for (const internal of ['gemini-3-pro-internal', 'veo-internal', 'gs://growthos-media-internal']) expect(text).not.toContain(internal);
    expect(screen.queryByTestId('ad-studio-admin-storage')).toBeNull();
    expect(screen.queryByTestId('ad-studio-admin-ffmpeg')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save limits' })).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(text).toContain('Daily limits come from your GrowthOS plan.');
    // Usage is in the page KPIs; the card doesn't repeat it for a customer.
    expect(text).not.toContain('3/50');
    // Every call is still listed, with a failure explained.
    expect(within(screen.getByTestId('ad-studio-usage-cards')).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByTestId('ad-studio-keyword-data')).toBeInTheDocument();
  });

  it('shows a platform operator the internals, today against the limits, and the form', () => {
    const { container } = renderWithIntl(<AdStudioAdminPanel {...PROPS} canConfigure />, { locale: 'en' });
    const text = container.textContent ?? '';
    expect(text).toContain('gemini-3-pro-internal');
    expect(screen.getByTestId('ad-studio-admin-storage')).toHaveTextContent('gs://growthos-media-internal');
    expect(screen.getByTestId('ad-studio-admin-ffmpeg')).toBeInTheDocument();
    expect(text).toContain('3/50');
    expect(screen.getByRole('button', { name: 'Save limits' })).toBeInTheDocument();
  });

  it('lets an operator choose the image size, 2K by default, and saves it with the limits', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ settings: {} }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(<AdStudioAdminPanel {...PROPS} canConfigure />, { locale: 'en' });
    const size = screen.getByTestId('ad-studio-image-size') as HTMLSelectElement;
    expect(size.value).toBe('2K');
    expect(screen.getByRole('option', { name: '2K - recommended' })).toBeInTheDocument();
    fireEvent.change(size, { target: { value: '1K' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save limits' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ imageSize: '1K', videoQa: { enabled: true, retries: 1 } });
    vi.unstubAllGlobals();
  });

  it('renders the calls as phone cards and a desktop table, each date kept left-to-right (KAN-343)', () => {
    renderWithIntl(<AdStudioAdminPanel {...PROPS} />, { locale: 'he' });
    const cards = within(screen.getByTestId('ad-studio-usage-cards')).getAllByRole('listitem');
    expect(cards[0].querySelector('bdi[dir="ltr"]')).not.toBeNull();
    const table = screen.getByRole('table');
    expect(table.closest('div')).toHaveClass('hidden', 'sm:block');
    // No model column for a customer.
    expect(within(table).getAllByRole('columnheader')).toHaveLength(3);
  });
});
