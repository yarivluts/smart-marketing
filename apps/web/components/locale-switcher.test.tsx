import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { LocaleSwitcher } from './locale-switcher';
import messages from '../messages/en.json';

const replace = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace }),
}));

function renderSwitcher(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LocaleSwitcher />
    </NextIntlClientProvider>,
  );
}

describe('LocaleSwitcher', () => {
  it('lists every configured locale', () => {
    renderSwitcher();
    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Hebrew' })).toBeInTheDocument();
  });

  it('navigates to the newly selected locale on change', () => {
    renderSwitcher();
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'he' } });
    expect(replace).toHaveBeenCalledWith('/', { locale: 'he' });
  });
});
