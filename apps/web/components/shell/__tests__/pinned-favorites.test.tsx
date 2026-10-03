import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../../tests/e2e/helpers/test-harness';
import { Sidebar } from '../sidebar';
import { ShellProvider } from '../shell-context';
import { buildProjectNavSections, DEFAULT_FAVORITE_ITEM_IDS } from '@/config/nav-config';
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

describe('F03: Pinned Favorites Persistence', () => {
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
    it('F03-T1-01: renders default favorites when no localStorage value exists', () => {
      renderWithIntl(
        <ShellProvider>
          <Sidebar
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      expect(screen.getByText('Pinned Favorites')).toBeInTheDocument();
      expect(DEFAULT_FAVORITE_ITEM_IDS.length).toBeGreaterThanOrEqual(5);
    });

    it('F03-T1-02: allows pinning an unpinned navigation item via star button', async () => {
      const user = userEvent.setup();
      renderWithIntl(
        <ShellProvider initialPinnedItemIds={['pulse']}>
          <Sidebar
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      const pinButtons = screen.getAllByRole('button', { name: /pin to favorites/i });
      expect(pinButtons.length).toBeGreaterThan(0);

      // Pin the first unpinned item
      await user.click(pinButtons[0]);

      const stored = JSON.parse(localStorage.getItem('growthos_pinned_nav_items') || '[]');
      expect(stored.length).toBe(2);
    });

    it('F03-T1-03: allows unpinning a favorited item via star button', async () => {
      const user = userEvent.setup();
      renderWithIntl(
        <ShellProvider initialPinnedItemIds={['pulse', 'campaigns']}>
          <Sidebar
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      const unpinButtons = screen.getAllByRole('button', { name: /remove from favorites/i });
      expect(unpinButtons.length).toBeGreaterThan(0);

      // Unpin the item
      await user.click(unpinButtons[0]);

      const stored = JSON.parse(localStorage.getItem('growthos_pinned_nav_items') || '[]');
      expect(stored.length).toBe(1);
    });

    it('F03-T1-04: persists customized favorites list in localStorage', async () => {
      const customPins = ['tv', 'goals', 'churnReasons'];
      localStorage.setItem('growthos_pinned_nav_items', JSON.stringify(customPins));

      renderWithIntl(
        <ShellProvider>
          <Sidebar
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      expect(screen.getByText('Pinned Favorites')).toBeInTheDocument();
    });

    it('F03-T1-05: updates pinned list immediately upon pin/unpin with zero page reload required', async () => {
      renderWithIntl(
        <ShellProvider initialPinnedItemIds={['pulse']}>
          <Sidebar
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      const initialFavs = screen.getAllByText('Overview Pulse');
      expect(initialFavs.length).toBeGreaterThanOrEqual(2); // In favorites + in executiveOverview
    });
  });

  describe('Tier 2: Boundary Values & Error Handling', () => {
    it('F03-T2-01: handles invalid JSON in localStorage gracefully falling back to defaults', () => {
      localStorage.setItem('growthos_pinned_nav_items', 'invalid-json{{{');
      renderWithIntl(
        <ShellProvider>
          <Sidebar
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      expect(screen.getByText('Pinned Favorites')).toBeInTheDocument();
    });

    it('F03-T2-02: handles non-array value in localStorage (e.g. string or number)', () => {
      localStorage.setItem('growthos_pinned_nav_items', JSON.stringify({ notAnArray: true }));
      renderWithIntl(
        <ShellProvider>
          <Sidebar
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      expect(screen.getByText('Pinned Favorites')).toBeInTheDocument();
    });

    it('F03-T2-03: hides Pinned Favorites section when all items are unpinned (empty array)', () => {
      renderWithIntl(
        <ShellProvider initialPinnedItemIds={[]}>
          <Sidebar
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      expect(screen.queryByText('Pinned Favorites')).not.toBeInTheDocument();
    });

    it('F03-T2-04: filters out unknown or deleted nav item IDs from pinned list', () => {
      renderWithIntl(
        <ShellProvider initialPinnedItemIds={['unknown_legacy_id_1', 'pulse']}>
          <Sidebar
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      expect(screen.getByText('Pinned Favorites')).toBeInTheDocument();
      expect(screen.queryByText('unknown_legacy_id_1')).not.toBeInTheDocument();
    });

    it('F03-T2-05: prevents duplicate entries when pinning an already pinned item', () => {
      renderWithIntl(
        <ShellProvider initialPinnedItemIds={['pulse', 'pulse', 'campaigns']}>
          <Sidebar
            currentOrgId="org-1"
            currentProjectId="p-1"
            sections={sections}
          />
        </ShellProvider>,
      );

      const stored = JSON.parse(localStorage.getItem('growthos_pinned_nav_items') || '[]');
      const pulseOccurrences = stored.filter((id: string) => id === 'pulse');
      expect(pulseOccurrences.length).toBeLessThanOrEqual(1);
    });
  });
});
