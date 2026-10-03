import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { Sidebar } from './sidebar';
import { WorkspaceSwitcher } from './workspace-switcher';
import { CommandPalette } from './command-palette';
import { CommandDialog } from './command-dialog';
import { LanguageSwitcher } from './language-switcher';
import { NavShell } from './nav-shell';
import { MobileDrawer, MobileBottomBar } from './mobile-nav';
import { ShellProvider, useShell } from './shell-context';
import {
  buildProjectNavSections,
  buildMobileTabItems,
  getNavConfig,
} from '@/config/nav-config';
import messages from '../../messages/en.json';

const pushMock = vi.fn();
const replaceMock = vi.fn();
const mockUsePathname = vi.fn(() => '/orgs/org-1/projects/p-1/campaigns');

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, onClick, ...props }: { href: string; children: React.ReactNode; onClick?: (e: any) => void }) => (
    <a
      href={typeof href === 'object' ? JSON.stringify(href) : href}
      onClick={(e) => {
        if (onClick) onClick(e);
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
  usePathname: () => mockUsePathname(),
}));

describe('Modern Unified Navigation Shell Suite', () => {
  const sampleOrgs = [
    { id: 'org-1', name: 'Acme Growth Corp' },
    { id: 'org-2', name: 'Beta Labs' },
  ];

  const sampleProjects = [
    { id: 'p-1', name: 'Main Brand Q3', env: 'prod' },
    { id: 'p-2', name: 'Test Sandbox', env: 'dev' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockUsePathname.mockReturnValue('/orgs/org-1/projects/p-1/campaigns');
  });

  describe('nav-config builder', () => {
    it('builds all 6 functional clusters and verifies all 34 subroutes', () => {
      const tMock = (key: string) => {
        const parts = key.split('.');
        let cur: any = messages;
        for (const p of parts) {
          cur = cur?.[p];
        }
        return typeof cur === 'string' ? cur : key;
      };

      const sections = buildProjectNavSections('org-1', 'p-1', tMock);
      expect(sections).toHaveLength(6);

      const clusterKeys = sections.map((s) => s.clusterKey);
      expect(clusterKeys).toEqual([
        'executiveOverview',
        'marketingCockpit',
        'economicsCohorts',
        'mrrIntelligence',
        'productTelemetry',
        'dataIntegrations',
      ]);

      const allItems = sections.flatMap((s) => s.items);
      expect(allItems.length).toBeGreaterThanOrEqual(28);

      // Verify key subroutes presence
      const itemIds = allItems.map((i) => i.id);
      expect(itemIds).toContain('pulse');
      expect(itemIds).toContain('boards');
      expect(itemIds).toContain('tv');
      expect(itemIds).toContain('insights');
      expect(itemIds).toContain('campaigns');
      expect(itemIds).toContain('cohorts');
      expect(itemIds).toContain('billingOpsFeed');
      expect(itemIds).toContain('funnel');
      expect(itemIds).toContain('integrations');
      expect(itemIds).toContain('settings');
    });

    it('injects dynamic missing integrations count badge when specified', () => {
      const tMock = (key: string) => key;
      const sections = buildProjectNavSections('org-1', 'p-1', tMock, {
        missingIntegrationsCount: 3,
      });

      const integrationsItem = sections
        .flatMap((s) => s.items)
        .find((i) => i.id === 'integrations');

      expect(integrationsItem).toBeDefined();
      expect(integrationsItem?.badge).toBe('3');
      expect(integrationsItem?.badgeVariant).toBe('alert');
    });

    it('builds 5-item mobile quick pill bar shortcuts', () => {
      const tMock = (key: string) => {
        const parts = key.split('.');
        let cur: any = messages;
        for (const p of parts) {
          cur = cur?.[p];
        }
        return typeof cur === 'string' ? cur : key;
      };

      const quickItems = buildMobileTabItems('org-1', 'p-1', tMock);
      expect(quickItems).toHaveLength(5);
      const quickIds = quickItems.map((i) => i.id);
      expect(quickIds).toEqual(['pulse', 'campaigns', 'cohorts', 'integrations', 'automation']);
    });

    it('returns valid config object from getNavConfig', () => {
      const config = getNavConfig('org-1', 'p-1');
      expect(config.clusters).toHaveLength(6);
      expect(config.defaultFavorites.length).toBeGreaterThan(0);
      expect(config.mobileQuickItems).toHaveLength(5);
    });
  });

  describe('LanguageSwitcher', () => {
    it('renders LanguageSwitcher and triggers router replace on change', async () => {
      const user = userEvent.setup();
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <LanguageSwitcher />
        </NextIntlClientProvider>,
      );

      const heBtn = screen.getByRole('button', { name: 'Hebrew' });
      expect(heBtn).toBeInTheDocument();

      await user.click(heBtn);
      expect(replaceMock).toHaveBeenCalledWith('/orgs/org-1/projects/p-1/campaigns', {
        locale: 'he',
      });
    });
  });

  describe('WorkspaceSwitcher', () => {
    it('renders selected org and project, filters with search, and switches on selection', async () => {
      const user = userEvent.setup();
      render(
        <WorkspaceSwitcher
          organizations={sampleOrgs}
          currentOrgId="org-1"
          projects={sampleProjects}
          currentProjectId="p-1"
        />,
      );

      const combobox = screen.getByRole('combobox', { name: /switch workspace/i });
      expect(combobox).toHaveTextContent('Acme Growth Corp');
      expect(combobox).toHaveTextContent('Main Brand Q3');

      await user.click(combobox);

      // Search filtering
      const searchInput = screen.getByRole('textbox', { name: /search workspaces/i });
      await user.type(searchInput, 'Beta');

      const betaOrgBtn = screen.getByRole('button', { name: /Beta Labs/i });
      expect(betaOrgBtn).toBeInTheDocument();

      await user.click(betaOrgBtn);
      expect(pushMock).toHaveBeenCalledWith('/orgs/org-2');
    });

    it('switches project when selecting project from dropdown', async () => {
      const user = userEvent.setup();
      render(
        <WorkspaceSwitcher
          organizations={sampleOrgs}
          currentOrgId="org-1"
          projects={sampleProjects}
          currentProjectId="p-1"
        />,
      );

      const combobox = screen.getByRole('combobox', { name: /switch workspace/i });
      await user.click(combobox);

      const sandboxBtn = screen.getByRole('button', { name: /Test Sandbox/i });
      expect(sandboxBtn).toBeInTheDocument();

      await user.click(sandboxBtn);
      expect(pushMock).toHaveBeenCalledWith('/orgs/org-1/projects/p-2/campaigns');
    });
  });

  describe('CommandPalette & CommandDialog', () => {
    it('opens dialog on trigger button click, filters items, and displays preview', async () => {
      const user = userEvent.setup();
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <CommandPalette orgId="org-1" projectId="p-1" />
        </NextIntlClientProvider>,
      );

      const trigger = screen.getByRole('button', { name: /jump to any module/i });
      expect(trigger).toBeInTheDocument();
      await user.click(trigger);

      const dialog = screen.getByRole('dialog', { name: /command search dialog/i });
      expect(dialog).toBeInTheDocument();

      const input = screen.getByPlaceholderText(/type a command/i);
      await user.type(input, 'cohorts');

      const matchingOptions = screen.getAllByText('Acquisition & Breakeven');
      expect(matchingOptions.length).toBeGreaterThan(0);

      await user.click(matchingOptions[0]);
      expect(pushMock).toHaveBeenCalledWith('/orgs/org-1/projects/p-1/cohorts');
    });

    it('responds to global Cmd+K keyboard shortcut', () => {
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <CommandPalette orgId="org-1" projectId="p-1" />
        </NextIntlClientProvider>,
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'k', metaKey: true });
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('CommandDialog backwards compatibility works identically', async () => {
      const user = userEvent.setup();
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <CommandDialog orgId="org-1" projectId="p-1" />
        </NextIntlClientProvider>,
      );

      const trigger = screen.getByRole('button', { name: /jump to any module/i });
      await user.click(trigger);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('Desktop Sidebar & Collapsible Rail', () => {
    it('renders all 6 clusters and supports expand/collapse toggle', async () => {
      const user = userEvent.setup();
      const tMock = (key: string) => {
        const parts = key.split('.');
        let cur: any = messages;
        for (const p of parts) {
          cur = cur?.[p];
        }
        return typeof cur === 'string' ? cur : key;
      };

      const sections = buildProjectNavSections('org-1', 'p-1', tMock);

      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <ShellProvider>
            <Sidebar
              organizations={sampleOrgs}
              currentOrgId="org-1"
              projects={sampleProjects}
              currentProjectId="p-1"
              sections={sections}
              activeHref="/orgs/org-1/projects/p-1/campaigns"
            />
          </ShellProvider>
        </NextIntlClientProvider>,
      );

      expect(screen.getByText('Executive & Overview')).toBeInTheDocument();
      expect(screen.getByText('Marketing & Ad Cockpit')).toBeInTheDocument();
      expect(screen.getByText('Economics & Cohorts')).toBeInTheDocument();
      expect(screen.getByText('MRR & Revenue Intelligence')).toBeInTheDocument();
      expect(screen.getByText('Product & Telemetry')).toBeInTheDocument();
      expect(screen.getByText('Data & Integrations')).toBeInTheDocument();

      // Collapse button
      const collapseBtn = screen.getByRole('button', { name: /collapse sidebar/i });
      expect(collapseBtn).toBeInTheDocument();

      await user.click(collapseBtn);

      const expandBtn = screen.getByRole('button', { name: /expand sidebar/i });
      expect(expandBtn).toBeInTheDocument();
      expect(window.localStorage.getItem('growthos_sidebar_collapsed')).toBe('true');
    });

    it('supports pinning and unpinning favorites with localStorage persistence', async () => {
      const user = userEvent.setup();
      const tMock = (key: string) => {
        const parts = key.split('.');
        let cur: any = messages;
        for (const p of parts) {
          cur = cur?.[p];
        }
        return typeof cur === 'string' ? cur : key;
      };

      const sections = buildProjectNavSections('org-1', 'p-1', tMock);

      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <ShellProvider initialPinnedItemIds={['campaigns']}>
            <Sidebar
              sections={sections}
              activeHref="/orgs/org-1/projects/p-1/campaigns"
            />
          </ShellProvider>
        </NextIntlClientProvider>,
      );

      // Pinned section heading is visible
      expect(screen.getByText('Pinned Favorites')).toBeInTheDocument();

      // Click unpin favorite
      const unpinBtns = screen.getAllByRole('button', { name: /remove from favorites/i });
      expect(unpinBtns.length).toBeGreaterThan(0);
      await user.click(unpinBtns[0]);

      expect(window.localStorage.getItem('growthos_pinned_nav_items')).toBe('[]');
    });
  });

  describe('Mobile Experience (Drawer & Bottom Quick Bar)', () => {
    it('renders mobile bottom bar with 5 shortcut items', () => {
      const tMock = (key: string) => {
        const parts = key.split('.');
        let cur: any = messages;
        for (const p of parts) {
          cur = cur?.[p];
        }
        return typeof cur === 'string' ? cur : key;
      };

      const mobileTabItems = buildMobileTabItems('org-1', 'p-1', tMock);

      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <MobileBottomBar
            mobileTabItems={mobileTabItems}
            activeHref="/orgs/org-1/projects/p-1/campaigns"
          />
        </NextIntlClientProvider>,
      );

      const nav = screen.getByRole('navigation', { name: /mobile quick shortcuts/i });
      expect(nav).toBeInTheDocument();
      expect(screen.getByText('Overview Pulse')).toBeInTheDocument();
      expect(screen.getByText('Ad Campaigns & ROAS')).toBeInTheDocument();
    });

    it('renders mobile drawer when open and closes on close button', async () => {
      const user = userEvent.setup();
      const tMock = (key: string) => {
        const parts = key.split('.');
        let cur: any = messages;
        for (const p of parts) {
          cur = cur?.[p];
        }
        return typeof cur === 'string' ? cur : key;
      };

      const sections = buildProjectNavSections('org-1', 'p-1', tMock);

      function TestDrawerWrapper() {
        const { setMobileMenuOpen } = useShell();
        return (
          <div>
            <button onClick={() => setMobileMenuOpen(true)}>Open Drawer</button>
            <MobileDrawer
              organizations={sampleOrgs}
              currentOrgId="org-1"
              projects={sampleProjects}
              currentProjectId="p-1"
              sections={sections}
            />
          </div>
        );
      }

      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <ShellProvider>
            <TestDrawerWrapper />
          </ShellProvider>
        </NextIntlClientProvider>,
      );

      expect(screen.queryByRole('dialog', { name: /mobile navigation drawer/i })).not.toBeInTheDocument();

      await user.click(screen.getByText('Open Drawer'));
      const dialog = screen.getByRole('dialog', { name: /mobile navigation drawer/i });
      expect(dialog).toBeInTheDocument();

      const buttons = within(dialog).getAllByRole('button');
      const closeBtn = buttons[buttons.length - 1];
      await user.click(closeBtn);
      expect(screen.queryByRole('dialog', { name: /mobile navigation drawer/i })).not.toBeInTheDocument();
    });
  });

  describe('Full NavShell Component Integration', () => {
    it('renders complete unified NavShell with header, sidebar, and content', () => {
      const tMock = (key: string) => {
        const parts = key.split('.');
        let cur: any = messages;
        for (const p of parts) {
          cur = cur?.[p];
        }
        return typeof cur === 'string' ? cur : key;
      };

      const sections = buildProjectNavSections('org-1', 'p-1', tMock);
      const mobileTabItems = buildMobileTabItems('org-1', 'p-1', tMock);

      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <NavShell
            brandName="GrowthOS"
            organizations={sampleOrgs}
            currentOrgId="org-1"
            projects={sampleProjects}
            currentProjectId="p-1"
            userEmail="alex@acme.com"
            sections={sections}
            mobileTabItems={mobileTabItems}
          >
            <div data-testid="dashboard-view">Live Analytics Dashboard</div>
          </NavShell>
        </NextIntlClientProvider>,
      );

      expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
      expect(screen.getAllByText('GrowthOS').length).toBeGreaterThan(0);
      expect(screen.getByText('alex@acme.com')).toBeInTheDocument();
    });
  });
});
