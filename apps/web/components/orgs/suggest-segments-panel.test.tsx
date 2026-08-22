import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SuggestSegmentsPanel } from './suggest-segments-panel';
import messages from '../../messages/en.json';

function renderPanel(onApplySuggestion = vi.fn(), schemaName = 'customer') {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SuggestSegmentsPanel orgId="org-1" projectId="project-1" schemaName={schemaName} onApplySuggestion={onApplySuggestion} />
    </NextIntlClientProvider>,
  );
  return onApplySuggestion;
}

describe('SuggestSegmentsPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('is collapsed by default', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Suggest segments' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suggest' })).not.toBeInTheDocument();
  });

  it('is disabled until an entity schema is chosen', () => {
    renderPanel(vi.fn(), '');
    expect(screen.getByRole('button', { name: 'Suggest segments' })).toBeDisabled();
  });

  it('requests suggestions for the chosen schema and lists them', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [{ name: 'High-value customers', filters: [{ field: 'mrr_usd', op: '>=', value: 100 }], confidence: 0.85 }],
      }),
    } as Response);
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Suggest segments' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/projects/project-1/segments/suggest',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ schemaName: 'customer' }) }),
      ),
    );
    expect(await screen.findByText('High-value customers (85% match)')).toBeInTheDocument();
  });

  it('applies a suggestion’s name and filters, stringifying non-string values', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [{ name: 'Recently churned customers', filters: [{ field: 'is_churned', op: '=', value: true }], confidence: 1 }],
      }),
    } as Response);
    const onApplySuggestion = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Suggest segments' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    await screen.findByText('Recently churned customers (100% match)');

    fireEvent.click(screen.getByRole('button', { name: 'Use this' }));

    expect(onApplySuggestion).toHaveBeenCalledWith({
      name: 'Recently churned customers',
      filters: [{ field: 'is_churned', op: '=', value: 'true' }],
    });
  });

  it('shows a message when there are no confident suggestions', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ suggestions: [] }) } as Response);
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Suggest segments' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));

    expect(await screen.findByText('No confident suggestions for this entity schema yet.')).toBeInTheDocument();
  });

  it('shows an inline error when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Suggest segments' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't get suggestions. Please try again.");
  });

  it('closes the panel via the close button', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Suggest segments' }));
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: 'Suggest segments' })).toBeInTheDocument();
  });
});
