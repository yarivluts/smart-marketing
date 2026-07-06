import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MintedApiKeyDisplay } from './minted-api-key-display';
import messages from '../../messages/en.json';

function renderDisplay(onDismiss: () => void): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MintedApiKeyDisplay rawKey="gos_live_secret123" onDismiss={onDismiss} />
    </NextIntlClientProvider>,
  );
}

describe('MintedApiKeyDisplay', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('shows the raw key and copies it to the clipboard', async () => {
    renderDisplay(vi.fn());

    expect(screen.getByText('gos_live_secret123')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('gos_live_secret123'));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('calls onDismiss when Done is clicked', () => {
    const onDismiss = vi.fn();
    renderDisplay(onDismiss);

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
