import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { TokenSignIn } from './token-sign-in';
import messages from '../../messages/en.json';

const push = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push }),
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : String(href)} {...props}>
      {children}
    </a>
  ),
}));

let searchParamsValue = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsValue,
}));

const signInWithToken = vi.fn();
vi.mock('@/lib/auth/auth-context', () => ({
  useAuth: () => ({ signInWithToken }),
}));

function renderPage(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TokenSignIn />
    </NextIntlClientProvider>,
  );
}

describe('TokenSignIn', () => {
  beforeEach(() => {
    push.mockClear();
    signInWithToken.mockClear();
    searchParamsValue = new URLSearchParams();
  });

  it('exchanges a ?token= query param for a session and redirects to the default target', async () => {
    signInWithToken.mockResolvedValue(undefined);
    searchParamsValue = new URLSearchParams({ token: 'a-custom-token' });

    renderPage();

    expect(screen.getByText('Signing you in...')).toBeInTheDocument();
    await waitFor(() => expect(signInWithToken).toHaveBeenCalledWith('a-custom-token'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
  });

  it('honors ?from= as the post-sign-in redirect, same as the email/password flow', async () => {
    signInWithToken.mockResolvedValue(undefined);
    searchParamsValue = new URLSearchParams({ token: 'a-custom-token', from: '/orgs/org-1' });

    renderPage();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/orgs/org-1'));
  });

  it('shows an error and a way back to /login when no token is present', async () => {
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
    expect(signInWithToken).not.toHaveBeenCalled();
  });

  it('shows the invalid/expired-token message when the exchange itself fails', async () => {
    signInWithToken.mockRejectedValue({ code: 'auth/invalid-custom-token' });
    searchParamsValue = new URLSearchParams({ token: 'stale-token' });

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('This sign-in link is invalid or has expired.');
    expect(push).not.toHaveBeenCalled();
  });

  it('never attempts the exchange more than once for the same mount (single-use token safety)', async () => {
    signInWithToken.mockResolvedValue(undefined);
    searchParamsValue = new URLSearchParams({ token: 'a-custom-token' });

    renderPage();

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(signInWithToken).toHaveBeenCalledTimes(1);
  });
});
