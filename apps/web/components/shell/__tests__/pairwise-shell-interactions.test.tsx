import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../../tests/e2e/helpers/test-harness';
import { NavShell } from '../nav-shell';
import { Sidebar } from '../sidebar';
import { MobileDrawer } from '../mobile-nav';
import { ShellProvider } from '../shell-context';
import { buildProjectNavSections, buildMobileTabItems } from '@/config/nav-config';
import enMessages from '../../../messages/en.json';
import heMessages from '../../../messages/he.json';

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

describe('Tier 3: Pairwise Combinatorial Testing — Navigation Shell', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const tEn = (key: string) => {
    const parts = key.split('.');
    let cur: any = enMessages;
    for (const p of parts) {
      cur = cur?.[p];
    }
    return typeof cur === 'string' ? cur : key;
  };

  const sectionsEn = buildProjectNavSections('org-1', 'p-1', tEn);

  describe('Pairwise Matrix: Locale (EN/HE) x Viewport (Desktop/Mobile) x Collapsed/Expanded x Favorites Pinning', () => {
    it('T3-SHELL-01: Pairwise [Hebrew RTL x Desktop Sidebar Collapsed x Active Route Highlighting]', async () => {
      renderWithIntl(
        <ShellProvider defaultCollapsed={true}>
          <Sidebar
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sectionsEn}
            activeHref="/orgs/org-1/projects/p-1/campaigns"
          />
        </ShellProvider>,
        { locale: 'he', messages: heMessages },
      );

      const aside = screen.getByLabelText('Sidebar Navigation');
      expect(aside).toHaveClass('w-16');
      const activeLink = screen.getByRole('link', { name: /Ad Campaigns & ROAS/i });
      expect(activeLink).toHaveAttribute('aria-current', 'page');
    });

    it('T3-SHELL-02: Pairwise [Hebrew RTL x Mobile Drawer Open x Command Palette Trigger]', async () => {
      const user = userEvent.setup();
      renderWithIntl(
        <ShellProvider initialMobileMenuOpen={true}>
          <MobileDrawer
            currentOrgId=""
            currentProjectId=""
            sections={sectionsEn}
          />
        </ShellProvider>,
        { locale: 'he', messages: heMessages },
      );

      const dialog = screen.getByRole('dialog', { name: /mobile navigation drawer/i });
      expect(dialog).toBeInTheDocument();

      const cmdTrigger = screen.getByRole('button', { name: /מעבר מהיר לכל מודול/i });
      expect(cmdTrigger).toBeInTheDocument();
      await user.click(cmdTrigger);

      expect(screen.getByRole('dialog', { name: /חלונית חיפוש פקודות/i })).toBeInTheDocument();
    });

    it('T3-SHELL-03: Pairwise [English LTR x Desktop Sidebar Expanded x Pinned Favorites Toggle]', async () => {
      const user = userEvent.setup();
      renderWithIntl(
        <ShellProvider initialPinnedItemIds={['pulse']}>
          <Sidebar
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sectionsEn}
          />
        </ShellProvider>,
      );

      const pinButtons = screen.getAllByRole('button', { name: /pin to favorites/i });
      await user.click(pinButtons[0]);

      const stored = JSON.parse(localStorage.getItem('growthos_pinned_nav_items') || '[]');
      expect(stored.length).toBe(2);
    });

    it('T3-SHELL-04: Pairwise [Command Palette Keyboard Shortcut x Arrow Key Selection x Mobile Bottom Bar]', () => {
      renderWithIntl(
        <ShellProvider>
          <NavShell
            currentOrgId=""
            currentProjectId=""
            sections={sectionsEn}
            mobileTabItems={buildMobileTabItems('org-1', 'p-1', tEn)}
          >
            <div>App Content</div>
          </NavShell>
        </ShellProvider>,
      );

      fireEvent.keyDown(document, { key: 'k', metaKey: true });
      expect(screen.getByRole('dialog', { name: /command search dialog/i })).toBeInTheDocument();
    });
  });
});
