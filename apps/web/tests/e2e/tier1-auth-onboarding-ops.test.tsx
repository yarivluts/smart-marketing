import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from './helpers/test-harness';
import { EmailPasswordForm } from '@/components/auth/email-password-form';
import { ProjectSettingsForm } from '@/components/orgs/project-settings-form';
import { ChangeRoleControl } from '@/components/orgs/change-role-control';
import enMessages from '@/messages/en.json';

const mockUseSearchParams = vi.fn();
const mockRouterPush = vi.fn();
const mockRouterRefresh = vi.fn();

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
    refresh: mockRouterRefresh,
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

describe('Tier 1: Auth, Onboarding & Operations Management (R2.5, R2.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearchParams.mockReturnValue({ get: () => null });
  });

  it('9.1 EmailPasswordForm (Sign In): renders email and password fields, handles valid submission and redirects', async () => {
    mockSignInWithEmail.mockResolvedValueOnce(undefined);

    renderWithIntl(<EmailPasswordForm mode="signin" />);

    expect(screen.getByRole('heading', { name: enMessages.Auth.signInTitle })).toBeInTheDocument();
    expect(screen.getByLabelText(enMessages.Auth.emailLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(enMessages.Auth.passwordLabel)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(enMessages.Auth.emailLabel), {
      target: { value: 'user@growthos.io' },
    });
    fireEvent.change(screen.getByLabelText(enMessages.Auth.passwordLabel), {
      target: { value: 'password123' },
    });

    const submitBtn = screen.getByRole('button', { name: enMessages.Auth.signIn });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockSignInWithEmail).toHaveBeenCalledWith('user@growthos.io', 'password123');
      expect(mockRouterPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('9.2 EmailPasswordForm (Sign Up): renders sign up heading and calls signUpWithEmail', async () => {
    mockSignUpWithEmail.mockResolvedValueOnce(undefined);

    renderWithIntl(<EmailPasswordForm mode="signup" />);

    expect(screen.getByRole('heading', { name: enMessages.Auth.signUpTitle })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(enMessages.Auth.emailLabel), {
      target: { value: 'newuser@growthos.io' },
    });
    fireEvent.change(screen.getByLabelText(enMessages.Auth.passwordLabel), {
      target: { value: 'securePass999!' },
    });

    const submitBtn = screen.getByRole('button', { name: enMessages.Auth.signUp });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockSignUpWithEmail).toHaveBeenCalledWith('newuser@growthos.io', 'securePass999!');
      expect(mockRouterPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('9.3 EmailPasswordForm: handles authentication errors gracefully and displays localized error message', async () => {
    mockSignInWithEmail.mockRejectedValueOnce({ code: 'auth/invalid-credential' });

    renderWithIntl(<EmailPasswordForm mode="signin" />);

    fireEvent.change(screen.getByLabelText(enMessages.Auth.emailLabel), {
      target: { value: 'wrong@growthos.io' },
    });
    fireEvent.change(screen.getByLabelText(enMessages.Auth.passwordLabel), {
      target: { value: 'wrongpass' },
    });

    fireEvent.click(screen.getByRole('button', { name: enMessages.Auth.signIn }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(enMessages.Auth.invalidCredentialsError);
    });
  });

  it('9.4 ProjectSettingsForm: renders project name & vertical inputs, validates empty name, and saves changes', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    global.fetch = mockFetch;

    renderWithIntl(
      <ProjectSettingsForm
        orgId="org-1"
        projectId="proj-1"
        initialName="EasySign SaaS"
        initialVertical="LegalTech"
      />,
    );

    const nameInput = screen.getByLabelText(enMessages.ProjectSettings.nameLabel);
    const verticalInput = screen.getByLabelText(enMessages.ProjectSettings.verticalLabel);

    expect(nameInput).toHaveValue('EasySign SaaS');
    expect(verticalInput).toHaveValue('LegalTech');

    // Test empty validation
    fireEvent.change(nameInput, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: enMessages.ProjectSettings.save }));

    expect(screen.getByRole('alert')).toHaveTextContent(enMessages.ProjectSettings.nameRequiredError);
    expect(mockFetch).not.toHaveBeenCalled();

    // Test valid update
    fireEvent.change(nameInput, { target: { value: 'EasySign Enterprise' } });
    fireEvent.change(verticalInput, { target: { value: 'FinTech & Legal' } });
    fireEvent.click(screen.getByRole('button', { name: enMessages.ProjectSettings.save }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/projects/proj-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'EasySign Enterprise', vertical: 'FinTech & Legal' }),
        }),
      );
      expect(screen.getByText(enMessages.ProjectSettings.saved)).toBeInTheDocument();
      expect(mockRouterRefresh).toHaveBeenCalled();
    });
  });

  it('9.5 ChangeRoleControl: provides in-place dropdown to switch member roles (org_admin / viewer)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    global.fetch = mockFetch;

    renderWithIntl(
      <ChangeRoleControl
        orgId="org-1"
        membershipId="mem-123"
        role="viewer"
      />,
    );

    const select = screen.getByLabelText(enMessages.Members.changeRoleLabel);
    expect(select).toHaveValue('viewer');

    fireEvent.change(select, { target: { value: 'org_admin' } });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/members/mem-123',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ role: 'org_admin' }),
        }),
      );
      expect(mockRouterRefresh).toHaveBeenCalled();
    });
  });
});
