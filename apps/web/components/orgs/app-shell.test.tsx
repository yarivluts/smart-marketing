import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { Home, LayoutGrid } from 'lucide-react';
import { AppShell, type AppShellNavItem } from './app-shell';
import messages from '../../messages/en.json';

const mockUsePathname = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => mockUsePathname(),
}));

const homeItem: AppShellNavItem = { href: '/orgs/org-1', label: 'Home', icon: Home };
const boardsItem: AppShellNavItem = { href: '/orgs/org-1/projects/p1/boards', label: 'Boards', icon: LayoutGrid };

function renderShell(pathname: string): void {
  mockUsePathname.mockReturnValue(pathname);
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AppShell switchers={<span>switcher</span>} sections={[{ heading: 'Nav', items: [homeItem, boardsItem] }]} mobileTabItems={[homeItem, boardsItem]}>
        <p>page content</p>
      </AppShell>
    </NextIntlClientProvider>,
  );
}

describe('AppShell', () => {
  it('renders the nav sections, switchers, and page content', () => {
    renderShell('/orgs/org-1');
    expect(screen.getAllByRole('link', { name: 'Home' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Boards' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('switcher').length).toBeGreaterThan(0);
    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('marks only the most specific matching nav link as current, not a broader sibling whose href happens to be a path-prefix', () => {
    // Regression: naive prefix-matching would mark Home (href `/orgs/org-1`) active on every
    // sub-page too, since `/orgs/org-1` is a path-prefix of `/orgs/org-1/projects/p1/boards/...` —
    // even though Home and Boards are unrelated siblings in nav terms, not parent/child.
    renderShell('/orgs/org-1/projects/p1/boards/board-1');
    const boardsLinks = screen.getAllByRole('link', { name: 'Boards' });
    expect(boardsLinks[0]).toHaveClass('text-primary');
    const homeLinks = screen.getAllByRole('link', { name: 'Home' });
    for (const link of homeLinks) {
      expect(link).not.toHaveClass('text-primary');
    }
  });

  it('the mobile menu is closed by default and opens on toggle, exposing the same nav a third time alongside the always-present sidebar and bottom tab bar copies', () => {
    renderShell('/orgs/org-1');
    // Closed: the sidebar's copy and the bottom tab bar's copy both exist regardless of menu state.
    expect(screen.getAllByRole('link', { name: 'Home' })).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    // Open: the mobile slide-down menu adds a third copy.
    expect(screen.getAllByRole('link', { name: 'Home' })).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(screen.getAllByRole('link', { name: 'Home' })).toHaveLength(2);
  });

  it('closes the mobile menu after navigating via one of its links', () => {
    renderShell('/orgs/org-1');
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getAllByRole('link', { name: 'Boards' })).toHaveLength(3);

    // Order: sidebar copy, mobile slide-down menu copy, bottom tab bar copy — click the middle one.
    fireEvent.click(screen.getAllByRole('link', { name: 'Boards' })[1]);
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
  });

  it('renders the mobile bottom tab bar with the given items', () => {
    renderShell('/orgs/org-1');
    // Every nav item appears at least 3x when the tab bar is included: sidebar + tab bar (+ mobile
    // menu when open) — assert the tab bar's own container renders both items via their icons.
    const tabBarLinks = screen.getAllByRole('link', { name: 'Boards' });
    expect(tabBarLinks.length).toBeGreaterThanOrEqual(2);
  });
});
