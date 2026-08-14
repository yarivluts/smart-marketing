import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { InstallBuiltinPackSection } from './install-builtin-pack-section';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const PACKS = [
  { pluginId: 'com.growthos.saas-marketing-metrics' },
  { pluginId: 'com.growthos.engagement-pack' },
  { pluginId: 'com.growthos.landing-page-pack' },
];

function renderSection(packs = PACKS): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <InstallBuiltinPackSection orgId="org-1" projectId="project-1" packs={packs} />
    </NextIntlClientProvider>,
  );
}

describe('InstallBuiltinPackSection', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders one card per pack with its translated title and description', () => {
    renderSection();
    expect(screen.getByText('SaaS & Marketing Metrics')).toBeInTheDocument();
    expect(screen.getByText('Engagement Pack')).toBeInTheDocument();
    expect(screen.getByText('Landing Page Performance')).toBeInTheDocument();
    expect(screen.getByText(/Ad spend, signups, CAC/)).toBeInTheDocument();
  });

  it('clicking a card posts only pluginId — no version, scopes, or config — and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    renderSection();

    fireEvent.click(screen.getByText('Landing Page Performance'));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/plugins/builtin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pluginId: 'com.growthos.landing-page-pack' }),
    });
  });

  it('shows an inline error and does not refresh when install fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderSection();

    fireEvent.click(screen.getByText('Engagement Pack'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not install this pack. Please try again.');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('disables every card while one install is in flight', async () => {
    let resolveFetch: (value: Response) => void = () => {};
    vi.mocked(fetch).mockReturnValue(new Promise((resolve) => (resolveFetch = resolve)));
    renderSection();

    fireEvent.click(screen.getByText('SaaS & Marketing Metrics'));
    await waitFor(() => expect(screen.getAllByRole('button').every((button) => button.hasAttribute('disabled'))).toBe(true));

    resolveFetch({ ok: true, json: async () => ({}) } as Response);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('shows an "all installed" message instead of a grid when no packs are installable', () => {
    renderSection([]);
    expect(screen.getByText('Every built-in pack is already installed in this project.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('falls back to the raw plugin id for an unrecognized pack rather than rendering blank', () => {
    renderSection([{ pluginId: 'com.example.future-pack' }]);
    expect(screen.getByText('com.example.future-pack')).toBeInTheDocument();
  });
});
