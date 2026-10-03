import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../../tests/e2e/helpers/test-harness';
import { MobileDrawer, MobileBottomBar } from '../mobile-nav';
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

describe('F04: Mobile Responsive Shell (Drawer & Bottom Shortcut Bar)', () => {
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

  describe('Tier 1: Primary Happy Path Scenarios', () => {
    it('F04-T1-01: renders bottom 5-pill shortcut bar with 5 high-frequency tabs', () => {
      renderWithIntl(
        <ShellProvider>
          <MobileBottomBar
            mobileTabItems={mobileTabItems}
            activeHref="/orgs/org-1/projects/p-1/campaigns"
          />
        </ShellProvider>,
      );

      const bottomNav = screen.getByLabelText('Mobile Quick Shortcuts');
      expect(bottomNav).toBeInTheDocument();
      expect(screen.getByText('Overview Pulse')).toBeInTheDocument();
      expect(screen.getByText('Ad Campaigns & ROAS')).toBeInTheDocument();
      expect(screen.getByText('Acquisition & Breakeven')).toBeInTheDocument();
      expect(screen.getByText('Integrations Hub')).toBeInTheDocument();
      expect(screen.getByText('AI Copilot & Actions')).toBeInTheDocument();
    });

    it('F04-T1-02: renders mobile drawer dialog when mobileMenuOpen is true', () => {
      renderWithIntl(
        <ShellProvider initialMobileMenuOpen={true}>
          <MobileDrawer
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      expect(screen.getByRole('dialog', { name: /mobile navigation drawer/i })).toBeInTheDocument();
      expect(screen.getByText('Executive & Overview')).toBeInTheDocument();
      expect(screen.getByText('Marketing & Ad Cockpit')).toBeInTheDocument();
    });

    it('F04-T1-03: closes mobile drawer automatically when a navigation link is clicked', async () => {
      const user = userEvent.setup();
      renderWithIntl(
        <ShellProvider initialMobileMenuOpen={true}>
          <MobileDrawer
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      const drawerDialog = screen.getByRole('dialog', { name: /mobile navigation drawer/i });
      expect(drawerDialog).toBeInTheDocument();

      const campaignLink = screen.getAllByText('Ad Campaigns & ROAS')[0];
      await user.click(campaignLink);

      expect(screen.queryByRole('dialog', { name: /mobile navigation drawer/i })).not.toBeInTheDocument();
    });

    it('F04-T1-04: closes mobile drawer when backdrop is clicked/tapped', async () => {
      const user = userEvent.setup();
      renderWithIntl(
        <ShellProvider initialMobileMenuOpen={true}>
          <MobileDrawer
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      const presentationBackdrop = screen.getByRole('presentation');
      await user.click(presentationBackdrop);

      expect(screen.queryByRole('dialog', { name: /mobile navigation drawer/i })).not.toBeInTheDocument();
    });

    it('F04-T1-05: highlights active shortcut tab in bottom bar with aria-current="page"', () => {
      renderWithIntl(
        <ShellProvider>
          <MobileBottomBar
            mobileTabItems={mobileTabItems}
            activeHref="/orgs/org-1/projects/p-1/campaigns"
          />
        </ShellProvider>,
      );

      const campaignTab = screen.getByRole('link', { name: /Ad Campaigns & ROAS/i });
      expect(campaignTab).toHaveAttribute('aria-current', 'page');
      expect(campaignTab).toHaveClass('text-primary');
    });
  });

  describe('Tier 2: Boundary Values & Error Handling', () => {
    it('F04-T2-01: renders nothing when mobileMenuOpen is false', () => {
      renderWithIntl(
        <ShellProvider initialMobileMenuOpen={false}>
          <MobileDrawer
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      expect(screen.queryByRole('dialog', { name: /mobile navigation drawer/i })).not.toBeInTheDocument();
    });

    it('F04-T2-02: returns null for MobileBottomBar when mobileTabItems is empty', () => {
      renderWithIntl(
        <ShellProvider>
          <MobileBottomBar mobileTabItems={[]} />
        </ShellProvider>,
      );

      expect(screen.queryByLabelText('Mobile Quick Shortcuts')).not.toBeInTheDocument();
    });

    it('F04-T2-03: verifies safe-area padding class is attached to bottom bar (pb-[env(safe-area-inset-bottom)])', () => {
      renderWithIntl(
        <ShellProvider>
          <MobileBottomBar mobileTabItems={mobileTabItems} />
        </ShellProvider>,
      );

      const bottomNav = screen.getByLabelText('Mobile Quick Shortcuts');
      expect(bottomNav.className).toContain('safe-area-inset-bottom');
    });

    it('F04-T2-04: verifies close button in mobile drawer closes drawer', async () => {
      const user = userEvent.setup();
      renderWithIntl(
        <ShellProvider initialMobileMenuOpen={true}>
          <MobileDrawer
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      const closeBtn = screen.getByRole('button', { name: /close menu/i });
      await user.click(closeBtn);

      expect(screen.queryByRole('dialog', { name: /mobile navigation drawer/i })).not.toBeInTheDocument();
    });

    it('F04-T2-05: prevents touch event propagation inside drawer container from closing drawer', async () => {
      const user = userEvent.setup();
      renderWithIntl(
        <ShellProvider initialMobileMenuOpen={true}>
          <MobileDrawer
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      const dialog = screen.getByRole('dialog', { name: /mobile navigation drawer/i });
      await user.click(dialog);

      // Should remain open
      expect(screen.getByRole('dialog', { name: /mobile navigation drawer/i })).toBeInTheDocument();
    });
  });
});
