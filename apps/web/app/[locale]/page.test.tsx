import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import enMessages from '../../messages/en.json';
import heMessages from '../../messages/he.json';
import HomePage from './page';

vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn(async () => (key: string) => enMessages.HomePage[key as 'title']),
}));
vi.mock('@/components/locale-switcher', () => ({ LocaleSwitcher: () => null }));
vi.mock('@/components/auth/account-status', () => ({
  AccountStatus: () => <a href="/signup">sign up</a>,
}));

describe('HomePage', () => {
  it('explains the product in plain words and offers only working links', async () => {
    render(await HomePage({ params: Promise.resolve({ locale: 'en' }) }));
    expect(screen.getByRole('heading', { name: 'GrowthOS' })).toBeInTheDocument();
    expect(screen.getByText(/nothing goes live until you say yes/i)).toBeInTheDocument();
    expect(screen.queryByText(/scaffold|TASKS\.md/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'sign up' })).toBeInTheDocument();
  });

  it('has the same keys in English and Hebrew without scaffold wording', () => {
    expect(Object.keys(heMessages.HomePage)).toEqual(Object.keys(enMessages.HomePage));
    expect(heMessages.HomePage.subtitle).not.toMatch(/TASKS|שלד/);
  });
});
