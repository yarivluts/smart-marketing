import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CommandDialog } from './command-dialog';
import en from '../../messages/en.json';
import he from '../../messages/he.json';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function open(locale: 'en' | 'he') {
  render(
    <NextIntlClientProvider locale={locale} messages={locale === 'he' ? he : en}>
      <CommandDialog orgId="o" projectId="p" />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: locale === 'he' ? 'פתיחת חיפוש מהיר' : 'Open command search' }));
}

describe('CommandDialog copy', () => {
  it('speaks plain English with no jargon titles', () => {
    open('en');
    expect(screen.getAllByText('Ads & results').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Cockpit|Thermometers|Copilot|Billboard/)).toBeNull();
    expect(screen.queryByText(/Route:/)).toBeNull();
  });

  it('is fully translated in Hebrew', () => {
    open('he');
    expect(screen.getAllByText(he.CommandPalette.items.campaigns.title).length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText(he.CommandPalette.inputPlaceholder)).toBeInTheDocument();
    expect(screen.queryByText('Ads & results')).toBeNull();
  });

  it('finds a page by its translated category', () => {
    open('he');
    fireEvent.change(screen.getByPlaceholderText(he.CommandPalette.inputPlaceholder), {
      target: { value: he.CommandPalette.categories.Operations },
    });
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('offers Growth Pilot and the Ad Studio first, in both languages', () => {
    for (const locale of ['en', 'he'] as const) {
      const { unmount } = render(
        <NextIntlClientProvider locale={locale} messages={locale === 'he' ? he : en}>
          <CommandDialog orgId="o" projectId="p" />
        </NextIntlClientProvider>,
      );
      fireEvent.click(
        screen.getByRole('button', { name: locale === 'he' ? 'פתיחת חיפוש מהיר' : 'Open command search' }),
      );
      const messages = locale === 'he' ? he : en;
      const options = screen.getAllByRole('option');
      expect(options[0]).toHaveTextContent(messages.CommandPalette.items['growth-pilot'].title);
      expect(options[1]).toHaveTextContent(messages.CommandPalette.items['ad-studio'].title);
      unmount();
    }
  });

  it('has the same keys in en and he', () => {
    expect(Object.keys(he.CommandPalette.items)).toEqual(Object.keys(en.CommandPalette.items));
    expect(Object.keys(he.CommandPalette)).toEqual(Object.keys(en.CommandPalette));
  });
});
