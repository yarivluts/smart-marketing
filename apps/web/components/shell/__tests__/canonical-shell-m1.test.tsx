import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../../tests/e2e/helpers/test-harness';
import { Header, EnvironmentBadge, NotificationBell, UserProfileMenu } from '../header';
import { Sidebar } from '../sidebar';
import { MobileBottomBar } from '../mobile-nav';
import { NavShell } from '../nav-shell';
import { ShellProvider } from '../shell-context';
import { buildProjectNavSections, buildMobileTabItems } from '@/config/nav-config';
import enMessages from '../../../messages/en.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, onClick, ...props }: { href: string; children: React.ReactNode; onClick?: () => void }) => (
    <a
      href={typeof href === 'object' ? JSON.stringify(href) : href}
      onClick={(e) => {
        e.preventDefault();
        onClick?.();
      }}
      {...props}
    >
      {children}
    </a>
  ),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => '/orgs/org-1/projects/p-1/campaigns',
}));

describe('Milestone 1: Canonical Pastel Pulse Shell Enhancements', () => {
  const t = (key: string) => {
    const parts = key.split('.');
    let cur: any = enMessages;
    for (const p of parts) {
      cur = cur?.[p];
    }
    return typeof cur === 'string' ? cur : key;
  };

  const sections = buildProjectNavSections('org-1', 'p-1', t);
  const mobileTabItems = buildMobileTabItems('org-1', 'p-1', t);

  describe('1. Canonical Obsidian Floating Bottom Dock', () => {
    it('renders floating bottom dock with obsidian #1E1E24 surface, 24px elevation, and shadow', () => {
      renderWithIntl(
        <ShellProvider>
          <MobileBottomBar
            mobileTabItems={mobileTabItems}
            activeHref="/orgs/org-1/projects/p-1/campaigns"
          />
        </ShellProvider>,
      );

      const nav = screen.getByLabelText('Mobile Quick Shortcuts');
      expect(nav).toBeInTheDocument();
      expect(nav.className).toContain('bg-[#1E1E24]/95');
      expect(nav.className).toContain('rounded-full');
      expect(nav.className).toContain('mb-6');
      expect(nav.className).toContain('h-16');
      expect(nav.className).toContain('max-w-md');
    });

    it('highlights active route with #2D3436 capsule fill, electric periwinkle #7064F4 icon, and #EBE9FD label', () => {
      renderWithIntl(
        <ShellProvider>
          <MobileBottomBar
            mobileTabItems={mobileTabItems}
            activeHref="/orgs/org-1/projects/p-1/campaigns"
          />
        </ShellProvider>,
      );

      const activeLink = screen.getByRole('link', { name: /Ad Campaigns & ROAS/i });
      expect(activeLink).toHaveAttribute('aria-current', 'page');
      expect(activeLink.className).toContain('bg-[#2D3436]');
      expect(activeLink.className).toContain('text-primary');
      const label = screen.getByText('Ad Campaigns & ROAS');
      expect(label.className).toContain('text-[#EBE9FD]');
    });
  });

  describe('2. Desktop Utility Header Enhancements', () => {
    it('renders EnvironmentBadge with dynamic status (DEV, STAGING, PROD) and pulsing dot', () => {
      const { rerender } = renderWithIntl(<EnvironmentBadge env="dev" />);
      expect(screen.getByLabelText('Environment: DEV')).toBeInTheDocument();
      expect(screen.getByText('DEV')).toBeInTheDocument();

      rerender(<EnvironmentBadge env="staging" />);
      expect(screen.getByLabelText('Environment: STAGING')).toBeInTheDocument();
      expect(screen.getByText('STAGING')).toBeInTheDocument();

      rerender(<EnvironmentBadge env="prod" />);
      expect(screen.getByLabelText('Environment: PROD')).toBeInTheDocument();
      expect(screen.getByText('PROD')).toBeInTheDocument();
    });

    it('renders NotificationBell with an honest empty state when no notifications exist', async () => {
      const user = userEvent.setup();
      renderWithIntl(<NotificationBell />);

      const bellBtn = screen.getByRole('button', { name: /notifications/i });
      await user.click(bellBtn);
      expect(screen.getByRole('dialog', { name: /notifications panel/i })).toBeInTheDocument();
      expect(screen.getByText("You're all caught up")).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /mark all read/i })).not.toBeInTheDocument();
    });

    it('renders NotificationBell unread counter from real notifications and clears it', async () => {
      const user = userEvent.setup();
      renderWithIntl(
        <NotificationBell
          notifications={[
            { id: 'a', title: 'Webhook Stream Ingesting', time: '12m ago', unread: true },
            { id: 'b', title: 'Missing Integration Alert', time: '1h ago', unread: true },
            { id: 'c', title: 'Old', time: '3d ago', unread: false },
          ]}
        />,
      );

      expect(screen.getByText('2')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /notifications/i }));
      expect(screen.getByText('Webhook Stream Ingesting')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /mark all read/i }));
      expect(screen.queryByText('2')).not.toBeInTheDocument();
    });

    it('renders UserProfileMenu with signed-in indicator and dropdown actions', async () => {
      const user = userEvent.setup();
      renderWithIntl(<UserProfileMenu userEmail="alex@acme.com" currentOrgId="org-1" />);

      const profileBtn = screen.getByRole('button', { name: /user profile menu/i });
      expect(profileBtn).toBeInTheDocument();
      expect(screen.getByLabelText('Status: Signed in')).toBeInTheDocument();

      await user.click(profileBtn);
      const menu = screen.getByRole('menu', { name: /user menu/i });
      expect(menu).toBeInTheDocument();
      expect(screen.getByText('Signed in as')).toBeInTheDocument();
      expect(screen.queryByText('Admin')).not.toBeInTheDocument();
      expect(screen.getByText('Account & Organization Settings')).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Sign Out' })).toBeInTheDocument();
    });

    it('Header integrates environment badge, notification bell, and user profile', () => {
      renderWithIntl(
        <ShellProvider>
          <Header
            brandName="GrowthOS"
            organizations={[{ id: 'org-1', name: 'Acme Corp' }]}
            currentOrgId="org-1"
            projects={[{ id: 'p-1', name: 'Main Brand' }]}
            currentProjectId="p-1"
            currentEnv="dev"
            userEmail="sarah@growthos.io"
          />
        </ShellProvider>,
      );

      expect(screen.getByLabelText('Environment: DEV')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /user profile menu/i })).toBeInTheDocument();
    });
  });

  describe('3. Pastel Pulse Periwinkle Sidebar', () => {
    it('applies Pastel Pulse lavender wash canvas and refined borders to sidebar', () => {
      renderWithIntl(
        <ShellProvider>
          <Sidebar
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
            activeHref="/orgs/org-1/projects/p-1/campaigns"
          />
        </ShellProvider>,
      );

      const aside = screen.getByLabelText('Sidebar Navigation');
      expect(aside.className).toContain('bg-pp-surface-container-lowest');
      expect(aside.className).toContain('w-72');
    });

    it('styles active sidebar links with the Stitch primary-fixed pill', () => {
      renderWithIntl(
        <ShellProvider>
          <Sidebar
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
            activeHref="/orgs/org-1/projects/p-1/campaigns"
          />
        </ShellProvider>,
      );

      const activeLinks = screen.getAllByRole('link', { name: /Ad Campaigns & ROAS/i });
      expect(activeLinks.length).toBeGreaterThan(0);
      expect(activeLinks[0].className).toContain('bg-pp-primary-fixed');
      expect(activeLinks[0].className).toContain('text-pp-on-primary-fixed');
    });
  });

  describe('4. Shell Container & Breakpoint Standardization', () => {
    it('NavShell provides outer <main id="main-content"> with 88px bottom clearance pb-[88px] lg:pb-8', () => {
      renderWithIntl(
        <NavShell
          brandName="GrowthOS"
          organizations={[{ id: 'org-1', name: 'Acme' }]}
          currentOrgId="org-1"
          projects={[{ id: 'p-1', name: 'Main' }]}
          currentProjectId="p-1"
          sections={sections}
          mobileTabItems={mobileTabItems}
        >
          <div data-testid="analytics-content">Wide Chart View</div>
        </NavShell>,
      );

      const mainLandmark = screen.getByRole('main');
      expect(mainLandmark).toHaveAttribute('id', 'main-content');
      expect(mainLandmark.className).toContain('pb-[88px]');
      expect(mainLandmark.className).toContain('lg:pb-8');
      expect(screen.getByTestId('analytics-content')).toBeInTheDocument();
    });
  });
});
