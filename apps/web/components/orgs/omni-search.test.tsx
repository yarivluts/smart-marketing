import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { OmniSearchTrigger } from './omni-search';
import messages from '../../messages/en.json';

const push = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push }),
}));

function renderTrigger(): ReturnType<typeof render> {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OmniSearchTrigger orgId="org-1" projectId="project-1" />
    </NextIntlClientProvider>,
  );
}

function mockFetchOnce(items: unknown[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items }) }),
  );
}

const BOARD_ITEM = { id: 'board-1', type: 'board', label: 'Marketing Overview', href: '/orgs/org-1/projects/project-1/boards/board-1' };
const METRIC_ITEM = { id: 'metric-1', type: 'metric', label: 'CAC', href: '/orgs/org-1/projects/project-1/metric-defs' };

describe('OmniSearchTrigger', () => {
  beforeEach(() => {
    push.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is closed until the trigger button is clicked', () => {
    mockFetchOnce([]);
    renderTrigger();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the palette and fetches the project index on click', async () => {
    mockFetchOnce([BOARD_ITEM]);
    renderTrigger();

    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/omnisearch'));
  });

  it('opens on Cmd+K / Ctrl+K from anywhere in the document', async () => {
    mockFetchOnce([]);
    renderTrigger();

    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('shows a prompt before typing, then ranked results matching the query', async () => {
    mockFetchOnce([BOARD_ITEM, METRIC_ITEM]);
    renderTrigger();
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    await screen.findByRole('dialog');

    expect(screen.getByText('Start typing to search this project.')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/search boards, metrics/i), { target: { value: 'cac' } });

    expect(await screen.findByText('CAC')).toBeInTheDocument();
    expect(screen.queryByText('Marketing Overview')).not.toBeInTheDocument();
  });

  it('shows a no-results state for a query matching nothing', async () => {
    mockFetchOnce([BOARD_ITEM]);
    renderTrigger();
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    await screen.findByRole('dialog');

    fireEvent.change(screen.getByPlaceholderText(/search boards, metrics/i), { target: { value: 'zzz-nonexistent' } });

    expect(await screen.findByText('No results for "zzz-nonexistent".')).toBeInTheDocument();
  });

  it('navigates and closes when a result is clicked', async () => {
    mockFetchOnce([BOARD_ITEM]);
    renderTrigger();
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    await screen.findByRole('dialog');
    fireEvent.change(screen.getByPlaceholderText(/search boards, metrics/i), { target: { value: 'marketing' } });

    fireEvent.click(await screen.findByText('Marketing Overview'));

    expect(push).toHaveBeenCalledWith(BOARD_ITEM.href);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('navigates to the highlighted result on Enter', async () => {
    mockFetchOnce([BOARD_ITEM]);
    renderTrigger();
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    await screen.findByRole('dialog');
    const input = screen.getByPlaceholderText(/search boards, metrics/i);
    fireEvent.change(input, { target: { value: 'marketing' } });
    await screen.findByText('Marketing Overview');

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(push).toHaveBeenCalledWith(BOARD_ITEM.href);
  });

  it('closes on Escape', async () => {
    mockFetchOnce([]);
    renderTrigger();
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    await screen.findByRole('dialog');

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('discards the cached index and refetches when the project changes under the same mounted instance', async () => {
    // Regression: React reconciles a client component by tree position, not prop equality, so a
    // client-side transition that swaps `projectId` without unmounting `OmniSearchTrigger` must not
    // keep serving the previous project's cached results.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [BOARD_ITEM] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [METRIC_ITEM] }) });
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <OmniSearchTrigger orgId="org-1" projectId="project-1" />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    await screen.findByRole('dialog');
    fireEvent.change(screen.getByPlaceholderText(/search boards, metrics/i), { target: { value: 'a' } });
    await screen.findByText('Marketing Overview');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <OmniSearchTrigger orgId="org-1" projectId="project-2" />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    await screen.findByRole('dialog');
    fireEvent.change(screen.getByPlaceholderText(/search boards, metrics/i), { target: { value: 'c' } });

    expect(await screen.findByText('CAC')).toBeInTheDocument();
    expect(screen.queryByText('Marketing Overview')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/orgs/org-1/projects/project-2/omnisearch');
  });

  it('does not refetch the index on a second open', async () => {
    mockFetchOnce([BOARD_ITEM]);
    renderTrigger();
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    await screen.findByRole('dialog');

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
