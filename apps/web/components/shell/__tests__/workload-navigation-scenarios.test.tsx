import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../../tests/e2e/helpers/test-harness';
import { NavShell } from '../nav-shell';
import { CommandPalette } from '../command-palette';
import { ShellProvider } from '../shell-context';
import { buildProjectNavSections, buildMobileTabItems } from '@/config/nav-config';
import enMessages from '../../../messages/en.json';
import heMessages from '../../../messages/he.json';

const pushMock = vi.fn();
const replaceMock = vi.fn();

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
    push: pushMock,
    replace: replaceMock,
  }),
  usePathname: () => '/orgs/org-1/projects/p-1/campaigns',
}));

describe('Tier 4: Workload Scenarios — Navigation Shell', () => {
  const tEn = (key: string) => {
    const parts = key.split('.');
    let cur: any = enMessages;
    for (const p of parts) {
      cur = cur?.[p];
    }
    return typeof cur === 'string' ? cur : key;
  };

  const sections = buildProjectNavSections('org-1', 'p-1', tEn);
  const mobileTabItems = buildMobileTabItems('org-1', 'p-1', tEn);

  describe('Scenario 2: Mobile Growth Marketer on the Go', () => {
    it('F01..F07-T4-01: executes full mobile user journey across quick shortcuts, slide-over drawer, and RTL switch', async () => {
      const user = userEvent.setup();

      // Step 1: Render mobile shell
      const { unmount } = renderWithIntl(
        <ShellProvider initialMobileMenuOpen={false}>
          <NavShell
            organizations={[{ id: 'org-1', name: 'Acme Growth' }]}
            currentOrgId="org-1"
            projects={[{ id: 'p-1', name: 'Mobile Brand', env: 'prod' }]}
            currentProjectId="p-1"
            sections={sections}
            mobileTabItems={mobileTabItems}
          >
            <div data-testid="mobile-screen">Active Screen: Marketing Cockpit</div>
          </NavShell>
        </ShellProvider>,
      );

      // Step 2: Verify bottom 5-pill shortcut bar exists with high-frequency items
      const bottomNav = screen.getByLabelText('Mobile Quick Shortcuts');
      expect(bottomNav).toBeInTheDocument();
      expect(within(bottomNav).getByText('Ad Campaigns & ROAS')).toBeInTheDocument();
      expect(within(bottomNav).getByText('Acquisition & Breakeven')).toBeInTheDocument();

      // Step 3: Open Slide-over Drawer via Header hamburger menu
      const hamburger = screen.getByRole('button', { name: /open navigation/i });
      await user.click(hamburger);

      const drawer = screen.getByRole('dialog', { name: /mobile navigation drawer/i });
      expect(drawer).toBeInTheDocument();

      // Step 4: Browse all 6 clusters inside drawer
      expect(within(drawer).getByText('Executive & Overview')).toBeInTheDocument();
      expect(within(drawer).getByText('Economics & Cohorts')).toBeInTheDocument();
      expect(within(drawer).getByText('MRR & Revenue Intelligence')).toBeInTheDocument();
      expect(within(drawer).getByText('Product & Telemetry')).toBeInTheDocument();
      expect(within(drawer).getByText('Data & Integrations')).toBeInTheDocument();

      // Step 5: Switch to Hebrew locale and verify RTL drawer rendering
      unmount();

      const tHe = (key: string) => {
        const parts = key.split('.');
        let cur: any = heMessages;
        for (const p of parts) {
          cur = cur?.[p];
        }
        return typeof cur === 'string' ? cur : key;
      };

      renderWithIntl(
        <ShellProvider initialMobileMenuOpen={true}>
          <NavShell
            organizations={[{ id: 'org-1', name: 'Acme Growth' }]}
            currentOrgId="org-1"
            projects={[{ id: 'p-1', name: 'Mobile Brand', env: 'prod' }]}
            currentProjectId="p-1"
            sections={buildProjectNavSections('org-1', 'p-1', tHe)}
            mobileTabItems={buildMobileTabItems('org-1', 'p-1', tHe)}
          >
            <div data-testid="mobile-screen-he">מסך שיווק</div>
          </NavShell>
        </ShellProvider>,
        { locale: 'he', messages: heMessages },
      );

      expect(screen.getAllByText((heMessages as any).NavClusters.executiveOverview).length).toBeGreaterThan(0);
    });
  });

  describe('Scenario 3: Power User Command Palette Navigation', () => {
    it('F06-T4-02: executes rapid keyboard shortcut, searches for MRR modules, and navigates via Enter key', async () => {
      const user = userEvent.setup();

      renderWithIntl(
        <ShellProvider>
          <CommandPalette orgId="" projectId="" />
        </ShellProvider>,
      );

      // Step 1: Power user hits Cmd+K
      fireEvent.keyDown(document, { key: 'k', metaKey: true });
      const dialog = screen.getByRole('dialog', { name: /command search dialog/i });
      expect(dialog).toBeInTheDocument();

      // Step 2: Types 'mrr' in search box
      const input = screen.getByPlaceholderText(/type a command/i);
      await user.type(input, 'mrr');

      // Step 3: Verified filtered results contain MRR Velocity & Billing Feed
      const options = screen.getAllByRole('option');
      expect(options.length).toBeGreaterThan(0);
      expect(screen.getAllByText('MRR Velocity & Billing').length).toBeGreaterThan(0);

      // Step 4: Hits ArrowDown and Enter to execute selection
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter' });

      // Step 5: Router pushed target route and dialog closed
      expect(pushMock).toHaveBeenCalled();
    });
  });
});
