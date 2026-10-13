import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { useLocalDateTime } from './use-local-date-time';

function When({ iso }: { iso: string | null }): React.ReactElement {
  const format = useLocalDateTime({ dateStyle: 'medium', timeStyle: 'short' });
  return <span data-testid="when">{format(iso)}</span>;
}

describe('useLocalDateTime', () => {
  it('leaves the date out of the server render, so server and browser markup agree', () => {
    const html = renderToString(
      <NextIntlClientProvider locale="en" messages={{}}>
        <When iso="2026-09-27T12:00:00Z" />
      </NextIntlClientProvider>,
    );
    expect(html).toBe('<span data-testid="when"></span>');
  });

  it('formats in the browser once mounted, and stays empty for a missing or broken timestamp', () => {
    const { unmount } = renderWithIntl(<When iso="2026-09-27T12:00:00Z" />, { locale: 'en' });
    expect(screen.getByTestId('when')).toHaveTextContent(new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date('2026-09-27T12:00:00Z')));
    expect(screen.getByTestId('when')).toHaveTextContent('2026');
    unmount();
    for (const iso of [null, 'not a date']) {
      const view = renderWithIntl(<When iso={iso} />, { locale: 'en' });
      expect(screen.getByTestId('when')).toBeEmptyDOMElement();
      view.unmount();
    }
  });
});
