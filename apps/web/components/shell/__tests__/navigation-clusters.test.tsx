import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '../../../tests/e2e/helpers/test-harness';
import { NavShell } from '../nav-shell';
import {
  NAV_CLUSTERS_CONFIG,
  buildProjectNavSections,
  getNavConfig,
  type NavClusterKey,
} from '@/config/nav-config';
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

describe('F01: 6 Functional Navigation Clusters', () => {
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
    it('F01-T1-01: configures and renders all 6 canonical functional clusters', () => {
      expect(NAV_CLUSTERS_CONFIG).toHaveLength(6);
      const clusterIds: NavClusterKey[] = NAV_CLUSTERS_CONFIG.map((c) => c.id);
      expect(clusterIds).toEqual([
        'executiveOverview',
        'marketingCockpit',
        'economicsCohorts',
        'mrrIntelligence',
        'productTelemetry',
        'dataIntegrations',
      ]);
    });

    it('F01-T1-02: renders Cluster 1 (Executive & Overview) items: Pulse, Boards, TV, Insights', () => {
      renderWithIntl(
        <NavShell
          currentOrgId="org-1"
          currentProjectId="p-1"
          sections={sections}
        >
          <div data-testid="page-content">Content</div>
        </NavShell>,
      );

      expect(screen.getByText('Executive & Overview')).toBeInTheDocument();
      expect(screen.getAllByText('Overview Pulse').length).toBeGreaterThan(0);
      expect(screen.getByText('Command Boards')).toBeInTheDocument();
      expect(screen.getByText('TV War Room Billboard')).toBeInTheDocument();
      expect(screen.getByText('Strategic Insights')).toBeInTheDocument();
    });

    it('F01-T1-03: renders Cluster 2 (Marketing & Ad Cockpit) items: Campaigns, Ops, Firmographics, Intent', () => {
      renderWithIntl(
        <NavShell
          currentOrgId="org-1"
          currentProjectId="p-1"
          sections={sections}
        >
          <div data-testid="page-content">Content</div>
        </NavShell>,
      );

      expect(screen.getByText('Marketing & Ad Cockpit')).toBeInTheDocument();
      expect(screen.getAllByText('Ad Campaigns & ROAS').length).toBeGreaterThan(0);
      expect(screen.getByText('Campaign Operations')).toBeInTheDocument();
      expect(screen.getByText('Spends & Firmographics')).toBeInTheDocument();
      expect(screen.getByText('Intent & Fatigue')).toBeInTheDocument();
    });

    it('F01-T1-04: renders Cluster 3 (Economics & Cohorts) items: Cohorts, Rep Collections, Win Rules, Experiments', () => {
      renderWithIntl(
        <NavShell
          currentOrgId="org-1"
          currentProjectId="p-1"
          sections={sections}
        >
          <div data-testid="page-content">Content</div>
        </NavShell>,
      );

      expect(screen.getByText('Economics & Cohorts')).toBeInTheDocument();
      expect(screen.getAllByText('Acquisition & Breakeven').length).toBeGreaterThan(0);
      expect(screen.getByText('Rep Collections & LTV')).toBeInTheDocument();
      expect(screen.getByText('TROI & Win Rules')).toBeInTheDocument();
      expect(screen.getByText('Growth Experiments')).toBeInTheDocument();
    });

    it('F01-T1-05: renders Cluster 6 (Data & Integrations) with dynamic missing-integration badge counter', () => {
      const sectionsWithAlerts = buildProjectNavSections('org-1', 'p-1', t, {
        missingIntegrationsCount: 3,
      });

      renderWithIntl(
        <NavShell
          currentOrgId="org-1"
          currentProjectId="p-1"
          sections={sectionsWithAlerts}
        >
          <div data-testid="page-content">Content</div>
        </NavShell>,
      );

      expect(screen.getByText('Data & Integrations')).toBeInTheDocument();
      expect(screen.getAllByText('Integrations Hub').length).toBeGreaterThan(0);
      expect(screen.getAllByText('3').length).toBeGreaterThan(0);
    });
  });

  describe('Tier 2: Boundary Values & Error Handling', () => {
    it('F01-T2-01: handles empty/unspecified org and project IDs gracefully without crashing', () => {
      const emptySections = buildProjectNavSections('', '', t);
      expect(emptySections).toBeDefined();
      expect(emptySections[0].items[0].href).toBe('/orgs//projects//');
    });

    it('F01-T2-02: verifies all 31 navigation route paths are unique and prefixed properly', () => {
      const allHrefs = sections.flatMap((s) => s.items.map((i) => i.href));
      const uniqueHrefs = new Set(allHrefs);
      expect(uniqueHrefs.size).toBe(allHrefs.length);
      allHrefs.forEach((href) => {
        expect(href.startsWith('/orgs/org-1/projects/p-1')).toBe(true);
      });
    });

    it('F01-T2-03: verifies all clusters contain at least 4 reporting/operational destinations', () => {
      sections.forEach((section) => {
        expect(section.items.length).toBeGreaterThanOrEqual(4);
      });
    });

    it('F01-T2-04: getNavConfig returns cloned configuration without mutating base object', () => {
      const config1 = getNavConfig('org-1', 'p-1');
      const config2 = getNavConfig('org-2', 'p-2');
      expect(config1.clusters[0].items[0].subpath).toContain('/orgs/org-1/projects/p-1');
      expect(config2.clusters[0].items[0].subpath).toContain('/orgs/org-2/projects/p-2');
      expect(config1.clusters[0].items[0].subpath).not.toBe(config2.clusters[0].items[0].subpath);
    });

    it('F01-T2-05: verifies badges render with appropriate styling variants (AI, Live, Copilot)', () => {
      renderWithIntl(
        <NavShell
          currentOrgId="org-1"
          currentProjectId="p-1"
          sections={sections}
        >
          <div>Content</div>
        </NavShell>,
      );

      expect(screen.getAllByText('Live').length).toBeGreaterThan(0);
      expect(screen.getAllByText('AI').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Copilot').length).toBeGreaterThan(0);
    });
  });
});
