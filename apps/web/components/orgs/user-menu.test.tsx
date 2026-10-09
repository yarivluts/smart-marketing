import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../../messages/en.json';
import { UserMenu } from './user-menu';

const replace = vi.fn();
const signOut = vi.fn(async () => undefined);
let user: { email: string; displayName: string | null } | null = null;

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ replace }),
}));
vi.mock('@/lib/auth/auth-context', () => ({ useAuth: () => ({ user, signOut }) }));

function renderMenu() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <UserMenu />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  replace.mockReset();
  signOut.mockClear();
});

describe('UserMenu', () => {
  it('renders nothing when signed out', () => {
    user = null;
    const { container } = renderMenu();
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the initial and email, opens the menu, and closes it on Escape', () => {
    user = { email: 'dana@example.com', displayName: null };
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    expect(trigger).toHaveTextContent('D');
    expect(trigger).toHaveTextContent('dana@example.com');
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toHaveTextContent('Signed in as');
    expect(screen.getByRole('menuitem', { name: /My account/ })).toHaveAttribute('href', '/dashboard');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('signs out and goes to the login page', async () => {
    user = { email: 'dana@example.com', displayName: 'Dana' };
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: /Sign out/ }));
    });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/login');
  });
});
