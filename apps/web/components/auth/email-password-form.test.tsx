import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { EmailPasswordForm } from './email-password-form';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';

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

  it('sign-up tells people the password rule before they type; sign-in does not', () => {
    const { unmount } = renderWithIntl(<EmailPasswordForm mode="signup" />, { locale: 'en' });
    expect(screen.getByText(enMessages.Auth.passwordHint)).toBeTruthy();
    expect(screen.getByLabelText(enMessages.Auth.passwordLabel).getAttribute('aria-describedby')).toBe('password-hint');
    unmount();
    renderWithIntl(<EmailPasswordForm mode="signin" />, { locale: 'en' });
    expect(screen.queryByText(enMessages.Auth.passwordHint)).toBeNull();
  });

  it('lets people reveal and hide the password they typed', () => {
    renderWithIntl(<EmailPasswordForm mode="signup" />, { locale: 'en' });
    const input = screen.getByLabelText(enMessages.Auth.passwordLabel) as HTMLInputElement;
    expect(input.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: enMessages.Auth.showPassword }));
    expect(input.type).toBe('text');
    const hide = screen.getByRole('button', { name: enMessages.Auth.hidePassword });
    expect(hide.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(hide);
    expect(input.type).toBe('password');
  });

  it('while waiting, the button says signing in or creating the account', async () => {
    mockSignInWithEmail.mockReturnValue(new Promise(() => {}));
    const { unmount } = renderWithIntl(<EmailPasswordForm mode="signin" />, { locale: 'en' });
    const email = screen.getByLabelText(enMessages.Auth.emailLabel);
    fireEvent.change(email, { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText(enMessages.Auth.passwordLabel), { target: { value: 'secret1' } });
    fireEvent.submit(email.closest('form') as HTMLFormElement);
    expect(await screen.findByText(enMessages.Auth.signingIn)).toBeTruthy();
    unmount();
    mockSignUpWithEmail.mockReturnValue(new Promise(() => {}));
    renderWithIntl(<EmailPasswordForm mode="signup" />, { locale: 'en' });
    const email2 = screen.getByLabelText(enMessages.Auth.emailLabel);
    fireEvent.change(email2, { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText(enMessages.Auth.passwordLabel), { target: { value: 'secret1' } });
    fireEvent.submit(email2.closest('form') as HTMLFormElement);
    expect(await screen.findByText(enMessages.Auth.creatingAccount)).toBeTruthy();
  });

  it('links a failed sign-in to both fields so screen readers hear why', async () => {
    mockSignInWithEmail.mockRejectedValue({ code: 'auth/invalid-credential' });
    renderWithIntl(<EmailPasswordForm mode="signin" />, { locale: 'en' });
    const email = screen.getByLabelText(enMessages.Auth.emailLabel);
    const password = screen.getByLabelText(enMessages.Auth.passwordLabel);
    expect(email.getAttribute('aria-invalid')).toBeNull();
    fireEvent.change(email, { target: { value: 'a@b.co' } });
    fireEvent.change(password, { target: { value: 'x' } });
    fireEvent.submit(email.closest('form') as HTMLFormElement);
    const alert = await screen.findByRole('alert');
    expect(alert.id).toBe('auth-error');
    for (const field of [email, password]) {
      expect(field.getAttribute('aria-invalid')).toBe('true');
      expect(field.getAttribute('aria-describedby')).toContain('auth-error');
    }
  });

  it('marks the email field when "Forgot password?" is pressed with no email', async () => {
    renderWithIntl(<EmailPasswordForm mode="signin" />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: enMessages.Auth.forgotPassword }));
    await screen.findByText(enMessages.Auth.resetNeedsEmail);
    const email = screen.getByLabelText(enMessages.Auth.emailLabel);
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(email.getAttribute('aria-describedby')).toBe('auth-reset-notice');
  });

  it('keeps the password rule linked on sign-up after an error', async () => {
    mockSignUpWithEmail.mockRejectedValue({ code: 'auth/email-already-in-use' });
    renderWithIntl(<EmailPasswordForm mode="signup" />, { locale: 'en' });
    const password = screen.getByLabelText(enMessages.Auth.passwordLabel);
    fireEvent.submit(password.closest('form') as HTMLFormElement);
    await screen.findByRole('alert');
    expect(password.getAttribute('aria-describedby')).toBe('password-hint auth-error');
  });

  it('weak-password error adds a next step instead of repeating the rule shown under the field', async () => {
    mockSignUpWithEmail.mockRejectedValue({ code: 'auth/weak-password' });
    renderWithIntl(<EmailPasswordForm mode="signup" />, { locale: 'en' });
    const password = screen.getByLabelText(enMessages.Auth.passwordLabel);
    fireEvent.submit(password.closest('form') as HTMLFormElement);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(enMessages.Auth.weakPasswordError);
    expect(enMessages.Auth.weakPasswordError).not.toBe(enMessages.Auth.passwordHint);
    expect(heMessages.Auth.weakPasswordError).not.toBe(heMessages.Auth.passwordHint);
    expect(enMessages.Auth.weakPasswordError).not.toMatch(/at least 6/);
  });

  it('keeps the email address left-to-right, also in the Hebrew (right-to-left) app', () => {
    renderWithIntl(<EmailPasswordForm mode="signin" />, { locale: 'he' });
    expect(screen.getByLabelText(heMessages.Auth.emailLabel)).toHaveAttribute('dir', 'ltr');
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

  it('shows no error when the person closes the Google window', async () => {
    mockSignInWithGoogle.mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' });
    renderWithIntl(<EmailPasswordForm mode="signin" />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: enMessages.Auth.signInWithGoogle }));
    await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalled());
    expect(screen.queryByText(enMessages.Auth.genericError)).toBeNull();
    expect(screen.getByRole('button', { name: enMessages.Auth.signInWithGoogle })).toBeEnabled();
  });

  it('tells the person when the browser blocked the Google window', async () => {
    mockSignInWithGoogle.mockRejectedValueOnce({ code: 'auth/popup-blocked' });
    renderWithIntl(<EmailPasswordForm mode="signin" />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: enMessages.Auth.signInWithGoogle }));
    expect(await screen.findByText(enMessages.Auth.popupBlockedError)).toBeInTheDocument();
  });

  it('triggers Google SSO sign in when Google button is clicked', async () => {
    mockSignInWithGoogle.mockResolvedValueOnce(undefined);

    renderWithIntl(<EmailPasswordForm mode="signin" />);

    const googleBtn = screen.getByRole('button', { name: enMessages.Auth.signInWithGoogle });
    fireEvent.click(googleBtn);

    await waitFor(() => {
      expect(mockSignInWithGoogle).toHaveBeenCalled();
      expect(mockRouterPush).toHaveBeenCalledWith('/start');
    });
  });
});
