import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { AddNikudButton } from './add-nikud-button';

afterEach(() => vi.unstubAllGlobals());

function renderButton(onVocalized = vi.fn()) {
  renderWithIntl(<AddNikudButton orgId="o" projectId="p" briefId="b" text="shalom" onVocalized={onVocalized} />, { locale: 'en' });
  return onVocalized;
}

describe('AddNikudButton', () => {
  it('hands back the vocalized narration', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ pronunciation: 'ok' }), { status: 200 })));
    const onVocalized = renderButton();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(onVocalized).toHaveBeenCalledWith('ok'));
  });

  it('shows a message, instead of nothing, when the connection drops', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const onVocalized = renderButton();
    fireEvent.click(screen.getByRole('button'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/\S/);
    expect(alert.textContent).not.toMatch(/Failed to fetch/);
    expect(onVocalized).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).not.toBeDisabled();
  });
});
