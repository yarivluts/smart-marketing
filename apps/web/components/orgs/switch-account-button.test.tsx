import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SwitchAccountButton } from './switch-account-button';
import messages from '../../messages/en.json';

const push = vi.fn();
const signOut = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/auth/auth-context', () => ({
  useAuth: () => ({ signOut }),
}));

function renderButton(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SwitchAccountButton fromPath="/invite/org-1/m1" />
    </NextIntlClientProvider>,
  );
}

describe('SwitchAccountButton', () => {
  beforeEach(() => {
    push.mockClear();
    signOut.mockClear();
  });

  it('signs the current user out and redirects to /login with the original path', async () => {
    signOut.mockResolvedValue(undefined);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out and switch account' }));

    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(push).toHaveBeenCalledWith({ pathname: '/login', query: { from: '/invite/org-1/m1' } });
  });
});
