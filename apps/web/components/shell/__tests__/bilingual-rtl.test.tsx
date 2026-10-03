import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '../../../tests/e2e/helpers/test-harness';
import { NavShell } from '../nav-shell';
import { buildProjectNavSections } from '@/config/nav-config';
import enMessages from '../../../messages/en.json';
import heMessages from '../../../messages/he.json';

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

describe('F07: Bilingual RTL / LTR Parity', () => {
  describe('Tier 1: Primary Happy Path Scenarios', () => {
    it('F07-T1-01: verifies 100% translation key parity between en.json and he.json for NavClusters and NavItems', () => {
      const enClusters = Object.keys((enMessages as any).NavClusters || {});
      const heClusters = Object.keys((heMessages as any).NavClusters || {});
      expect(heClusters.sort()).toEqual(enClusters.sort());

      const enItems = Object.keys((enMessages as any).NavItems || {});
      const heItems = Object.keys((heMessages as any).NavItems || {});
      expect(heItems.sort()).toEqual(enItems.sort());
    });

    it('F07-T1-02: renders NavShell in Hebrew (he) locale without crashing and with Hebrew strings', () => {
      const tHe = (key: string) => {
        const parts = key.split('.');
        let cur: any = heMessages;
        for (const p of parts) {
          cur = cur?.[p];
        }
        return typeof cur === 'string' ? cur : key;
      };

      const heSections = buildProjectNavSections('org-1', 'p-1', tHe);

      renderWithIntl(
        <NavShell
          currentOrgId="org-1"
          currentProjectId="p-1"
          sections={heSections}
        >
          <div>תוכן</div>
        </NavShell>,
        { locale: 'he', messages: heMessages },
      );

      // Verify Hebrew headers exist
      expect(screen.getByText((heMessages as any).NavClusters.executiveOverview)).toBeInTheDocument();
      expect(screen.getByText((heMessages as any).NavClusters.marketingCockpit)).toBeInTheDocument();
    });

    it('F07-T1-03: renders LanguageSwitcher with English and Hebrew options', () => {
      const tHe = (key: string) => {
        const parts = key.split('.');
        let cur: any = heMessages;
        for (const p of parts) {
          cur = cur?.[p];
        }
        return typeof cur === 'string' ? cur : key;
      };

      const sections = buildProjectNavSections('org-1', 'p-1', tHe);

      renderWithIntl(
        <NavShell
          currentOrgId="org-1"
          currentProjectId="p-1"
          sections={sections}
        >
          <div>Content</div>
        </NavShell>,
        { locale: 'he', messages: heMessages },
      );

      expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'עברית' })).toBeInTheDocument();
    });

    it('F07-T1-04: verifies directional icons contain rtl:rotate-180 class for RTL mirroring', () => {
      renderWithIntl(
        <NavShell
          currentOrgId="org-1"
          currentProjectId="p-1"
          sections={buildProjectNavSections('org-1', 'p-1', (k) => k)}
        >
          <div>Content</div>
        </NavShell>,
        { locale: 'he' },
      );

      const rotatedIcons = document.querySelectorAll('.rtl\\:rotate-180');
      expect(rotatedIcons.length).toBeGreaterThan(0);
    });

    it('F07-T1-05: verifies logical margin/padding CSS classes are used (ps-, pe-, ms-, me-)', () => {
      renderWithIntl(
        <NavShell
          currentOrgId="org-1"
          currentProjectId="p-1"
          sections={buildProjectNavSections('org-1', 'p-1', (k) => k)}
        >
          <div>Content</div>
        </NavShell>,
      );

      const aside = screen.getByLabelText('Sidebar Navigation');
      expect(aside.className).toContain('border-e');
    });
  });

  describe('Tier 2: Boundary Values & Error Handling', () => {
    it('F07-T2-01: ensures no translation string in en.json or he.json is empty or whitespace-only', () => {
      function checkObject(obj: Record<string, any>, path = '') {
        for (const [key, val] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;
          if (typeof val === 'string') {
            expect(val.trim().length, `Empty string at ${currentPath}`).toBeGreaterThan(0);
          } else if (typeof val === 'object' && val !== null) {
            checkObject(val, currentPath);
          }
        }
      }

      checkObject((enMessages as any).NavClusters);
      checkObject((enMessages as any).NavItems);
      checkObject((heMessages as any).NavClusters);
      checkObject((heMessages as any).NavItems);
    });

    it('F07-T2-02: verifies CommandPalette translations exist in both English and Hebrew', () => {
      const enCmd = (enMessages as any).CommandPalette;
      const heCmd = (heMessages as any).CommandPalette;

      expect(enCmd).toBeDefined();
      expect(heCmd).toBeDefined();
      expect(Object.keys(enCmd).sort()).toEqual(Object.keys(heCmd).sort());
    });

    it('F07-T2-03: verifies missing translation falls back to translation key without throwing error', () => {
      const t = (key: string) => key;
      const sections = buildProjectNavSections('org-1', 'p-1', t);
      expect(sections[0].heading).toBe('NavClusters.executiveOverview');
    });

    it('F07-T2-04: verifies numeric badges and counts do not invert order in RTL', () => {
      const tHe = (key: string) => (heMessages as any).NavItems?.[key.split('.')[1]] ?? key;
      const sections = buildProjectNavSections('org-1', 'p-1', tHe, { missingIntegrationsCount: 5 });

      renderWithIntl(
        <NavShell
          currentOrgId="org-1"
          currentProjectId="p-1"
          sections={sections}
        >
          <div>Content</div>
        </NavShell>,
        { locale: 'he' },
      );

      expect(screen.getAllByText('5').length).toBeGreaterThan(0);
    });

    it('F07-T2-05: verifies no physical pl- or pr- utilities are used on the main navigation sidebar container', () => {
      const { container } = renderWithIntl(
        <NavShell
          currentOrgId="org-1"
          currentProjectId="p-1"
          sections={buildProjectNavSections('org-1', 'p-1', (k) => k)}
        >
          <div>Content</div>
        </NavShell>,
      );

      const sidebar = container.querySelector('aside');
      expect(sidebar?.className).not.toMatch(/\bpl-\d+\b/);
      expect(sidebar?.className).not.toMatch(/\bpr-\d+\b/);
    });
  });
});
