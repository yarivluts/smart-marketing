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

const mockSendPasswordResetEmail = vi.fn();
vi.mock('firebase/auth', () => ({ sendPasswordResetEmail: (...args: unknown[]) => mockSendPasswordResetEmail(...args) }));
vi.mock('@/lib/firebase/client', () => ({ getFirebaseAuth: () => ({ name: 'test-auth' }) }));

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

  it('posts, so a submit before hydration never puts the password in the URL', () => {
    const { container } = renderWithIntl(<EmailPasswordForm mode="signin" />, { locale: 'en' });
    expect(container.querySelector('form')?.getAttribute('method')).toBe('post');
  });

  it('"Forgot password?" sends a reset link for the typed email, and asks for one first', async () => {
    mockSendPasswordResetEmail.mockResolvedValue(undefined);
    renderWithIntl(<EmailPasswordForm mode="signin" />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: enMessages.Auth.forgotPassword }));
    expect(await screen.findByText(enMessages.Auth.resetNeedsEmail)).toBeInTheDocument();
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(enMessages.Auth.emailLabel), { target: { value: 'a@b.co' } });
    fireEvent.click(screen.getByRole('button', { name: enMessages.Auth.forgotPassword }));
    await waitFor(() => expect(mockSendPasswordResetEmail).toHaveBeenCalledWith({ name: 'test-auth' }, 'a@b.co'));
    expect(await screen.findByText('If an account exists for a@b.co, a password reset link is on its way.')).toBeInTheDocument();
  });

  it('does not reveal whether the account exists', async () => {
    mockSendPasswordResetEmail.mockRejectedValue({ code: 'auth/user-not-found' });
    renderWithIntl(<EmailPasswordForm mode="signin" />, { locale: 'en' });
    fireEvent.change(screen.getByLabelText(enMessages.Auth.emailLabel), { target: { value: 'nobody@b.co' } });
    fireEvent.click(screen.getByRole('button', { name: enMessages.Auth.forgotPassword }));
    expect(await screen.findByText('If an account exists for nobody@b.co, a password reset link is on its way.')).toBeInTheDocument();
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
