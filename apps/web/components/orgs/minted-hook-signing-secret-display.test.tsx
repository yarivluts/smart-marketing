import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MintedHookSigningSecretDisplay } from './minted-hook-signing-secret-display';
import messages from '../../messages/en.json';

function renderDisplay(onDismiss: () => void): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MintedHookSigningSecretDisplay
        hookUrl="https://api.example.com/v1/hooks/project-1/hook-1"
        rawSigningSecret="super-secret-value"
        onDismiss={onDismiss}
      />
    </NextIntlClientProvider>,
  );
}

describe('MintedHookSigningSecretDisplay', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('shows the hook URL and raw secret, and copies the secret to the clipboard', async () => {
    renderDisplay(vi.fn());

    expect(screen.getByText('https://api.example.com/v1/hooks/project-1/hook-1')).toBeInTheDocument();
    expect(screen.getByText('super-secret-value')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('super-secret-value'));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('calls onDismiss when Done is clicked', () => {
    const onDismiss = vi.fn();
    renderDisplay(onDismiss);

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
