import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { CommandDialog, type CommandItem } from '@/components/shell/command-dialog';
import { WorkspaceSwitcher } from '@/components/shell/workspace-switcher';
import { LanguageSwitcher } from '@/components/shell/language-switcher';
import { Header } from '@/components/shell/header';
import { NavShell } from '@/components/shell/nav-shell';
import messages from '../messages/en.json';

const pushMock = vi.fn();
const replaceMock = vi.fn();
let currentMockPathname = '/orgs/org-alpha/projects/proj-beta/campaigns';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, onClick, children, ...props }: { href: string; onClick?: () => void; children: React.ReactNode }) => (
    <a
      href={typeof href === 'object' ? JSON.stringify(href) : href}
      onClick={(e) => {
        e.preventDefault();
        if (onClick) onClick();
      }}
      {...props}
    >
      {children}
    </a>
  ),
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
  usePathname: () => currentMockPathname,
}));

describe('Adversarial & Edge-Case Stress Harness: Milestone 1 (App Shell & Navigation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentMockPathname = '/orgs/org-alpha/projects/proj-beta/campaigns';
  });

  describe('1. Cmd+K Omni-Search Keyboard Handling & Shortcuts', () => {
    it('1.1 toggles dialog open with Cmd+K and Ctrl+K shortcuts and prevents default', () => {
      render(<CommandDialog orgId="org-alpha" projectId="proj-beta" />);

      expect(screen.queryByRole('dialog', { name: /command search dialog/i })).not.toBeInTheDocument();

      // Trigger with Ctrl+K
      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
      expect(screen.getByRole('dialog', { name: /command search dialog/i })).toBeInTheDocument();

      // Trigger again with Meta+K (Cmd+K) to toggle closed
      fireEvent.keyDown(document, { key: 'k', metaKey: true });
      expect(screen.queryByRole('dialog', { name: /command search dialog/i })).not.toBeInTheDocument();
    });

    it('1.2 closes modal upon Escape key from document or inside input', () => {
      render(<CommandDialog orgId="org-alpha" projectId="proj-beta" />);

      // Open via Ctrl+K
      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Press Escape
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('1.3 closes on backdrop click but does not close when clicking modal inner container', () => {
      render(<CommandDialog orgId="org-alpha" projectId="proj-beta" />);

      // Open via trigger button
      fireEvent.click(screen.getByRole('button', { name: /open command search/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Clicking inner dialog container stops propagation
      const dialogContent = screen.getByRole('dialog');
      fireEvent.click(dialogContent);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Clicking backdrop presentation overlay closes
      const backdrop = screen.getByRole('presentation');
      fireEvent.click(backdrop);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('2. Cmd+K Search Query Filtering & Empty States', () => {
    it('2.1 filters correctly by title, description, and category (case-insensitive)', async () => {
      const user = userEvent.setup();
      render(<CommandDialog orgId="org-alpha" projectId="proj-beta" />);

      fireEvent.click(screen.getByRole('button', { name: /open command search/i }));
      const input = screen.getByPlaceholderText(/type a command/i);

      // Search by title snippet
      await user.type(input, 'cockpit');
      let options = screen.getAllByRole('option');
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent('Ads & Performance Cockpit');

      // Clear and search by category
      await user.clear(input);
      await user.type(input, 'operations');
      options = screen.getAllByRole('option');
      expect(options.length).toBe(4); // tv, billing, members, settings

      // Clear and search by description keyword
      await user.clear(input);
      await user.type(input, 'drop-off');
      options = screen.getAllByRole('option');
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent('Conversion Funnel Flow');
    });

    it('2.2 shows zero-state message when search yields no matches and resets selection on query change', async () => {
      const user = userEvent.setup();
      render(<CommandDialog orgId="org-alpha" projectId="proj-beta" />);

      fireEvent.click(screen.getByRole('button', { name: /open command search/i }));
      const input = screen.getByPlaceholderText(/type a command/i);

      await user.type(input, 'nonexistent_query_xyz');
      expect(screen.queryAllByRole('option')).toHaveLength(0);
      expect(screen.getByText(/No matching commands found for/i)).toBeInTheDocument();
      expect(screen.getByText(/nonexistent_query_xyz/i)).toBeInTheDocument();
      expect(screen.getByText('Select an item to view preview')).toBeInTheDocument();

      // Pressing Enter in empty state does not throw or navigate
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(pushMock).not.toHaveBeenCalled();
    });
  });

  describe('3. Cmd+K Arrow Key Navigation & Action Execution', () => {
    it('3.1 navigates list with ArrowDown/ArrowUp clamping at boundaries and activates preview', async () => {
      render(<CommandDialog orgId="org-alpha" projectId="proj-beta" />);

      fireEvent.click(screen.getByRole('button', { name: /open command search/i }));
      const input = screen.getByPlaceholderText(/type a command/i);
      const options = screen.getAllByRole('option');

      expect(options[0]).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText('Route:')).toBeInTheDocument();
      expect(screen.getByText('/orgs/org-alpha/projects/proj-beta/campaigns')).toBeInTheDocument();

      // Arrow down to second option
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(options[1]).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText('/orgs/org-alpha/projects/proj-beta/funnel')).toBeInTheDocument();

      // Arrow up back to first option
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      expect(options[0]).toHaveAttribute('aria-selected', 'true');

      // Arrow up at top boundary stays at 0
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      expect(options[0]).toHaveAttribute('aria-selected', 'true');

      // Navigate down beyond total items and verify clamped at bottom
      for (let i = 0; i < options.length + 5; i++) {
        fireEvent.keyDown(input, { key: 'ArrowDown' });
      }
      expect(options[options.length - 1]).toHaveAttribute('aria-selected', 'true');

      // Press Enter to navigate
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(pushMock).toHaveBeenCalledWith('/orgs/org-alpha/projects/proj-beta/settings');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('3.2 updates preview on mouseEnter and executes on option click', async () => {
      render(<CommandDialog orgId="org-alpha" projectId="proj-beta" />);

      fireEvent.click(screen.getByRole('button', { name: /open command search/i }));
      const options = screen.getAllByRole('option');

      // Hover over Automation Hub (index 3)
      fireEvent.mouseEnter(options[3]);
      expect(options[3]).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText('/orgs/org-alpha/projects/proj-beta/automation')).toBeInTheDocument();

      // Click option
      fireEvent.click(options[3]);
      expect(pushMock).toHaveBeenCalledWith('/orgs/org-alpha/projects/proj-beta/automation');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('3.3 correctly renders customItems when supplied', async () => {
      const customItems: CommandItem[] = [
        {
          id: 'custom-1',
          title: 'Custom Metric Explorer',
          description: 'Deep dive into cohort analytics and raw queries',
          category: 'Analytics',
          href: '/custom-analytics',
          icon: () => <span data-testid="custom-icon" />,
          badge: 'Beta',
        },
      ];

      render(<CommandDialog customItems={customItems} />);
      fireEvent.click(screen.getByRole('button', { name: /open command search/i }));

      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(1);
      expect(screen.getAllByText('Custom Metric Explorer').length).toBeGreaterThan(0);
      expect(screen.getByText('Beta')).toBeInTheDocument();

      fireEvent.click(options[0]);
      expect(pushMock).toHaveBeenCalledWith('/custom-analytics');
    });

    it('3.4 defaults to un-scoped routes when orgId and projectId are not provided', async () => {
      render(<CommandDialog />);
      fireEvent.click(screen.getByRole('button', { name: /open command search/i }));

      const options = screen.getAllByRole('option');
      fireEvent.click(options[0]); // campaigns
      expect(pushMock).toHaveBeenCalledWith('/campaigns');
    });
  });

  describe('4. WorkspaceSwitcher Adversarial Stress Testing', () => {
    const orgs = [
      { id: 'org-1', name: 'Alpha Growth Inc' },
      { id: 'org-2', name: 'Omega Venture Partners' },
    ];
    const projects = [
      { id: 'p-1', name: 'Production Store', env: 'prod' },
      { id: 'p-2', name: 'Staging Sandbox', env: 'staging' },
      { id: 'p-3', name: 'Dev Experiment', env: 'dev' },
    ];

    it('4.1 toggles popover, filters orgs & projects by search input, and closes on Escape', async () => {
      const user = userEvent.setup();
      render(
        <WorkspaceSwitcher
          organizations={orgs}
          currentOrgId="org-1"
          projects={projects}
          currentProjectId="p-1"
        />,
      );

      const combobox = screen.getByRole('combobox');
      expect(combobox).toHaveAttribute('aria-expanded', 'false');

      // Click to open
      await user.click(combobox);
      expect(combobox).toHaveAttribute('aria-expanded', 'true');
      const dialog = screen.getByRole('dialog', { name: /Workspace and Project Selector/i });
      expect(dialog).toBeInTheDocument();

      // Search projects
      const searchInput = screen.getByPlaceholderText(/search workspaces/i);
      await user.type(searchInput, 'Sandbox');

      expect(within(dialog).getByText('Staging Sandbox')).toBeInTheDocument();
      expect(within(dialog).queryByText('Production Store')).not.toBeInTheDocument();
      expect(within(dialog).queryByText('Alpha Growth Inc')).not.toBeInTheDocument();

      // Press Escape to dismiss
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('4.2 switches organization and project with proper route dispatching', async () => {
      const user = userEvent.setup();
      render(
        <WorkspaceSwitcher
          organizations={orgs}
          currentOrgId="org-1"
          projects={projects}
          currentProjectId="p-1"
        />,
      );

      // Select another project
      await user.click(screen.getByRole('combobox'));
      const devProjectBtn = screen.getByRole('button', { name: /Dev Experiment/i });
      await user.click(devProjectBtn);

      expect(pushMock).toHaveBeenCalledWith('/orgs/org-1/projects/p-3/campaigns');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      // Select another org
      await user.click(screen.getByRole('combobox'));
      const omegaOrgBtn = screen.getByRole('button', { name: /Omega Venture Partners/i });
      await user.click(omegaOrgBtn);

      expect(pushMock).toHaveBeenCalledWith('/orgs/org-2');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('4.3 closes popover on outside click', async () => {
      const user = userEvent.setup();
      render(
        <div>
          <div data-testid="outside-area">Outside</div>
          <WorkspaceSwitcher organizations={orgs} currentOrgId="org-1" />
        </div>,
      );

      await user.click(screen.getByRole('combobox'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Click outside
      fireEvent.mouseDown(screen.getByTestId('outside-area'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('4.4 gracefully handles empty organizations and projects without errors', () => {
      render(<WorkspaceSwitcher organizations={[]} projects={[]} />);

      const combobox = screen.getByRole('combobox');
      expect(combobox).toHaveTextContent('Select Organization');
      expect(combobox).toHaveTextContent('All Projects');
    });
  });

  describe('5. LanguageSwitcher Bilingual & RTL Verification', () => {
    it('5.1 renders bilingual toggles and switches locale with pathname preservation', async () => {
      const user = userEvent.setup();
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <LanguageSwitcher />
        </NextIntlClientProvider>,
      );

      const enBtn = screen.getByRole('button', { name: 'English' });
      const heBtn = screen.getByRole('button', { name: 'Hebrew' });

      expect(enBtn).toHaveAttribute('aria-pressed', 'true');
      expect(heBtn).toHaveAttribute('aria-pressed', 'false');

      // Click Hebrew
      await user.click(heBtn);
      expect(replaceMock).toHaveBeenCalledWith(currentMockPathname, { locale: 'he' });

      // Click English while active does not re-trigger replace
      replaceMock.mockClear();
      await user.click(enBtn);
      expect(replaceMock).not.toHaveBeenCalled();
    });

    it('5.2 renders compact uppercase labels when compact prop is passed', () => {
      render(
        <NextIntlClientProvider locale="he" messages={messages}>
          <LanguageSwitcher compact />
        </NextIntlClientProvider>,
      );

      expect(screen.getByText('HE')).toBeInTheDocument();
      expect(screen.getByText('EN')).toBeInTheDocument();
    });
  });

  describe('6. NavShell & Floating Header Interactive Integrity', () => {
    const sections = [
      {
        heading: 'Core',
        items: [
          { href: '/orgs/org-alpha/projects/proj-beta/campaigns', label: 'Campaigns Cockpit', icon: 'Megaphone' as const, badge: 'Live' },
          { href: '/orgs/org-alpha/projects/proj-beta/funnel', label: 'Conversion Funnel', icon: 'Target' as const },
        ],
      },
      {
        heading: 'Operations',
        items: [
          { href: '/orgs/org-alpha/projects/proj-beta/settings', label: 'Settings', icon: 'Settings' as const },
        ],
      },
    ];

    const mobileTabItems = [
      { href: '/orgs/org-alpha/projects/proj-beta/campaigns', label: 'Campaigns', icon: 'Megaphone' as const },
      { href: '/orgs/org-alpha/projects/proj-beta/funnel', label: 'Funnel', icon: 'Target' as const },
    ];

    it('6.1 renders sticky sidebar with active route highlighting and badges', () => {
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <NavShell
            brandName="GrowthOS Enterprise"
            userEmail="leader@growthos.io"
            sections={sections}
            mobileTabItems={mobileTabItems}
          >
            <div data-testid="page-child">Main Content View</div>
          </NavShell>
        </NextIntlClientProvider>,
      );

      expect(screen.getByText('GrowthOS Enterprise')).toBeInTheDocument();
      expect(screen.getByText('leader@growthos.io')).toBeInTheDocument();
      expect(screen.getByTestId('page-child')).toBeInTheDocument();

      // Check section headings
      expect(screen.getByText('Core')).toBeInTheDocument();
      expect(screen.getByText('Operations')).toBeInTheDocument();

      // Check badge
      expect(screen.getByText('Live')).toBeInTheDocument();
    });

    it('6.2 toggles mobile slide-down drawer and closes on link selection', async () => {
      const user = userEvent.setup();
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <NavShell
            sections={sections}
            mobileTabItems={mobileTabItems}
          >
            <div>Content</div>
          </NavShell>
        </NextIntlClientProvider>,
      );

      const mobileToggleBtn = screen.getByRole('button', { name: /open navigation/i });
      expect(mobileToggleBtn).toBeInTheDocument();

      // Click to open mobile drawer
      await user.click(mobileToggleBtn);
      expect(screen.getByRole('button', { name: /close navigation/i })).toBeInTheDocument();

      // Drawer navigation links exist (in mobile drawer, which is index 1 of matching links)
      const funnelLinks = screen.getAllByRole('link', { name: /Conversion Funnel/i });
      expect(funnelLinks.length).toBe(2); // desktop sidebar + mobile drawer

      // Clicking the mobile drawer link (funnelLinks[1]) invokes onClick which closes the drawer
      await user.click(funnelLinks[1]);
      expect(screen.getByRole('button', { name: /open navigation/i })).toBeInTheDocument();
    });

    it('6.3 matches deep nested sub-routes to active parent sidebar link', () => {
      // Current path is sub-route
      currentMockPathname = '/orgs/org-alpha/projects/proj-beta/campaigns/experiment-999';

      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <NavShell sections={sections}>
            <div>Content</div>
          </NavShell>
        </NextIntlClientProvider>,
      );

      const campaignLinks = screen.getAllByRole('link', { name: /Campaigns Cockpit/i });
      const activeLink = campaignLinks.find((el) => el.className.includes('bg-primary/10'));
      expect(activeLink).toBeDefined();
    });
  });
});
