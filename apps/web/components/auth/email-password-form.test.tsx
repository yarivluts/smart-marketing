import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { EmailPasswordForm } from './email-password-form';
import enMessages from '@/messages/en.json';

const mockUseSearchParams = vi.fn();
const mockRouterPush = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const mockSignInWithEmail = vi.fn();
const mockSignUpWithEmail = vi.fn();
const mockSignInWithGoogle = vi.fn();

vi.mock('@/lib/auth/auth-context', () => ({
  useAuth: () => ({
    signInWithEmail: mockSignInWithEmail,
    signUpWithEmail: mockSignUpWithEmail,
    signInWithGoogle: mockSignInWithGoogle,
    user: null,
    loading: false,
    signOut: vi.fn(),
  }),
}));

describe('EmailPasswordForm Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearchParams.mockReturnValue({ get: () => null });
  });

  it('switches between Sign In and Sign Up tabs in-place', () => {
    renderWithIntl(<EmailPasswordForm mode="signin" />);

    expect(screen.getByRole('heading', { name: enMessages.Auth.signInTitle })).toBeInTheDocument();

    const signUpTab = screen.getByTestId('tab-signup');
    fireEvent.click(signUpTab);

    expect(screen.getByRole('heading', { name: enMessages.Auth.signUpTitle })).toBeInTheDocument();
  });

  it('triggers Google SSO sign in when Google button is clicked', async () => {
    mockSignInWithGoogle.mockResolvedValueOnce(undefined);

    renderWithIntl(<EmailPasswordForm mode="signin" />);

    const googleBtn = screen.getByRole('button', { name: enMessages.Auth.signInWithGoogle });
    fireEvent.click(googleBtn);

    await waitFor(() => {
      expect(mockSignInWithGoogle).toHaveBeenCalled();
      expect(mockRouterPush).toHaveBeenCalledWith('/dashboard');
    });
  });
});
