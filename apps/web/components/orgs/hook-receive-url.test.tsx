import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { HookReceiveUrl } from './hook-receive-url';
import messages from '../../messages/en.json';

function renderDisplay(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <HookReceiveUrl hookApiBaseUrl="https://api.example.com/v1/hooks" hookId="abc123" />
    </NextIntlClientProvider>,
  );
}

describe('HookReceiveUrl', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('renders the full receive URL', () => {
    renderDisplay();
    expect(screen.getByText('https://api.example.com/v1/hooks/abc123')).toBeInTheDocument();
  });

  it('copies the URL to the clipboard and shows confirmation', async () => {
    renderDisplay();

    fireEvent.click(screen.getByRole('button', { name: 'Copy URL' }));

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://api.example.com/v1/hooks/abc123'));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });
});
