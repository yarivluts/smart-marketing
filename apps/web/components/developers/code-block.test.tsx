import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../../messages/en.json';
import { CodeBlock } from './code-block';

describe('CodeBlock', () => {
  it('shows the code left-to-right and copies exactly that text', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const code = 'curl -sS https://api.test/v1/ingest/contract';
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <CodeBlock label="Terminal" code={code} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(code).closest('pre')).toHaveAttribute('dir', 'ltr');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });
    expect(writeText).toHaveBeenCalledWith(code);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });
});
