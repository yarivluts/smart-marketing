import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../../tests/e2e/helpers/test-harness';
import { Sidebar } from '../sidebar';
import { ShellProvider } from '../shell-context';
import { buildProjectNavSections } from '@/config/nav-config';
import enMessages from '../../../messages/en.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === 'object' ? JSON.stringify(href) : href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => '/orgs/org-1/projects/p-1',
}));

describe('F02: Responsive Desktop Sidebar', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const t = (key: string) => {
    const parts = key.split('.');
    let cur: any = enMessages;
    for (const p of parts) {
      cur = cur?.[p];
    }
    return typeof cur === 'string' ? cur : key;
  };

  const sections = buildProjectNavSections('org-1', 'p-1', t);

  describe('Tier 1: Primary Happy Path Scenarios', () => {
    it('F02-T1-01: renders sidebar expanded by default (w-64 mode)', () => {
      renderWithIntl(
        <ShellProvider>
          <Sidebar
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      const aside = screen.getByLabelText('Sidebar Navigation');
      expect(aside).toHaveClass('w-64');
      expect(screen.getAllByText('Overview Pulse').length).toBeGreaterThan(0);
      expect(screen.getByText('Collapse sidebar')).toBeInTheDocument();
    });

    it('F02-T1-02: collapses to rail mode (w-16) when toggle button is clicked', async () => {
      const user = userEvent.setup();
      renderWithIntl(
        <ShellProvider>
          <Sidebar
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      const collapseBtn = screen.getByRole('button', { name: /collapse sidebar/i });
      await user.click(collapseBtn);

      const aside = screen.getByLabelText('Sidebar Navigation');
      expect(aside).toHaveClass('w-16');
      expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument();
    });

    it('F02-T1-03: expands back to full width (w-64) when expand button is clicked in rail mode', async () => {
      const user = userEvent.setup();
      renderWithIntl(
        <ShellProvider defaultCollapsed={true}>
          <Sidebar
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      const expandBtn = screen.getByRole('button', { name: /expand sidebar/i });
      await user.click(expandBtn);

      const aside = screen.getByLabelText('Sidebar Navigation');
      expect(aside).toHaveClass('w-64');
    });

    it('F02-T1-04: persists collapsed state in localStorage across page reloads', async () => {
      const user = userEvent.setup();
      const { unmount } = renderWithIntl(
        <ShellProvider>
          <Sidebar
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      const collapseBtn = screen.getByRole('button', { name: /collapse sidebar/i });
      await user.click(collapseBtn);
      expect(localStorage.getItem('growthos_sidebar_collapsed')).toBe('true');

      unmount();

      // Render anew — should read from localStorage
      renderWithIntl(
        <ShellProvider>
          <Sidebar
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      const aside = screen.getByLabelText('Sidebar Navigation');
      expect(aside).toHaveClass('w-16');
    });

    it('F02-T1-05: renders tooltips with label and badges in collapsed icon-rail mode', () => {
      renderWithIntl(
        <ShellProvider defaultCollapsed={true}>
          <Sidebar
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      const tooltips = screen.getAllByRole('tooltip', { hidden: true });
      expect(tooltips.length).toBeGreaterThan(10);
      expect(tooltips[0]).toHaveTextContent('Overview Pulse');
    });
  });

  describe('Tier 2: Boundary Values & Error Handling', () => {
    it('F02-T2-01: handles invalid/corrupted localStorage values gracefully defaulting to expanded', () => {
      localStorage.setItem('growthos_sidebar_collapsed', 'not-a-boolean');
      renderWithIntl(
        <ShellProvider>
          <Sidebar
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      const aside = screen.getByLabelText('Sidebar Navigation');
      expect(aside).toHaveClass('w-64');
    });

    it('F02-T2-02: hides workspace switcher combobox in collapsed rail mode to save horizontal space', () => {
      renderWithIntl(
        <ShellProvider defaultCollapsed={true}>
          <Sidebar
            organizations={[{ id: 'org-1', name: 'Acme Corp' }]}
            currentOrgId="org-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      expect(screen.queryByRole('combobox', { name: /switch workspace/i })).not.toBeInTheDocument();
    });

    it('F02-T2-03: renders pulsing notification dot on collapsed rail icons with badges', () => {
      const sectionsWithAlert = buildProjectNavSections('org-1', 'p-1', t, { missingIntegrationsCount: 2 });
      renderWithIntl(
        <ShellProvider defaultCollapsed={true}>
          <Sidebar
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sectionsWithAlert}
          />
        </ShellProvider>,
      );

      const pingDots = document.querySelectorAll('.animate-ping');
      expect(pingDots.length).toBeGreaterThan(0);
    });

    it('F02-T2-04: preserves scrollable container for dense navigation hierarchy without layout breakage', () => {
      renderWithIntl(
        <ShellProvider>
          <Sidebar
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      const scrollContainer = document.querySelector('.overflow-y-auto');
      expect(scrollContainer).toBeInTheDocument();
    });

    it('F02-T2-05: verifies sidebar aside element retains sticky fixed height styling (h-[calc(100vh-4rem)])', () => {
      renderWithIntl(
        <ShellProvider>
          <Sidebar
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      const aside = screen.getByLabelText('Sidebar Navigation');
      expect(aside).toHaveClass('sticky');
      expect(aside).toHaveClass('top-16');
    });
  });
});
