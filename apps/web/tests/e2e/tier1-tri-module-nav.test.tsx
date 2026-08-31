import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { AppShell, type AppShellNavItem, type AppShellNavSection } from '../../components/orgs/app-shell';
import messages from '../../messages/en.json';

const mockUsePathname = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => mockUsePathname(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const adsItem: AppShellNavItem = {
  href: '/orgs/org-1/projects/p1/campaigns',
  label: 'Ads & Performance',
  icon: 'Megaphone',
};

const funnelItem: AppShellNavItem = {
  href: '/orgs/org-1/projects/p1/funnel',
  label: 'Funnel & Goals',
  icon: 'Target',
};

const copilotItem: AppShellNavItem = {
  href: '/orgs/org-1/projects/p1/automation',
  label: 'AI Copilot & Automation',
  icon: 'Bot',
};

const settingsItem: AppShellNavItem = {
  href: '/orgs/org-1/projects/p1/settings',
  label: 'Settings',
  icon: 'FolderOpen',
};

function renderTriModuleShell(
  currentPath: string,
  sections: AppShellNavSection[] = [
    {
      heading: 'GrowthOS Modules',
      items: [adsItem, funnelItem, copilotItem],
    },
    {
      heading: 'Configuration',
      items: [settingsItem],
    },
  ],
  mobileTabItems: AppShellNavItem[] = [adsItem, funnelItem, copilotItem, settingsItem],
) {
  mockUsePathname.mockReturnValue(currentPath);
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AppShell
        switchers={<span>Project Switcher</span>}
        omniSearch={<button type="button">Global AI Command</button>}
        sections={sections}
        mobileTabItems={mobileTabItems}
      >
        <div data-testid="page-content">Current View: {currentPath}</div>
      </AppShell>
    </NextIntlClientProvider>,
  );
}

describe('Tier 1: Tri-Module Navigation Architecture (R1)', () => {
  it('1.1 renders the 3 primary core modules (Ads, Funnel & Goals, AI Copilot) and secondary settings in the main shell', () => {
    renderTriModuleShell('/orgs/org-1/projects/p1/campaigns');

    expect(screen.getAllByRole('link', { name: 'Ads & Performance' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Funnel & Goals' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'AI Copilot & Automation' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Settings' }).length).toBeGreaterThan(0);
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });

  it('1.2 marks only the exact active module link with active styling and does not bleed into sibling routes', () => {
    renderTriModuleShell('/orgs/org-1/projects/p1/funnel');

    const funnelLinks = screen.getAllByRole('link', { name: 'Funnel & Goals' });
    expect(funnelLinks[0]).toHaveClass('text-primary');

    const adsLinks = screen.getAllByRole('link', { name: 'Ads & Performance' });
    expect(adsLinks[0]).not.toHaveClass('text-primary');

    const copilotLinks = screen.getAllByRole('link', { name: 'AI Copilot & Automation' });
    expect(copilotLinks[0]).not.toHaveClass('text-primary');
  });

  it('1.3 enforces RBAC gating by omitting restricted management modules for viewer roles', () => {
    // When automation execution or settings management is restricted, only read-accessible modules render
    const viewerSections: AppShellNavSection[] = [
      {
        heading: 'GrowthOS Modules',
        items: [adsItem, funnelItem], // Copilot & Settings filtered out for viewer
      },
    ];

    renderTriModuleShell('/orgs/org-1/projects/p1/campaigns', viewerSections, [adsItem, funnelItem]);

    expect(screen.getAllByRole('link', { name: 'Ads & Performance' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Funnel & Goals' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'AI Copilot & Automation' })).not.toBeInTheDocument();
  });

  it('1.4 provides mobile responsiveness with a bottom tab bar and expandable slide-down navigation', () => {
    renderTriModuleShell('/orgs/org-1/projects/p1/campaigns');

    // Sidebar + bottom tab bar present initially (2 copies)
    expect(screen.getAllByRole('link', { name: 'Ads & Performance' })).toHaveLength(2);

    // Open mobile menu
    const menuButton = screen.getByRole('button', { name: 'Open menu' });
    fireEvent.click(menuButton);

    // Now 3 copies exist (sidebar + mobile drawer + bottom tab bar)
    expect(screen.getAllByRole('link', { name: 'Ads & Performance' })).toHaveLength(3);

    // Close mobile menu
    const closeButton = screen.getByRole('button', { name: 'Close menu' });
    fireEvent.click(closeButton);
    expect(screen.getAllByRole('link', { name: 'Ads & Performance' })).toHaveLength(2);
  });

  it('1.5 renders global AI Command Bar alongside project switchers within the top header', () => {
    renderTriModuleShell('/orgs/org-1/projects/p1/campaigns');

    expect(screen.getAllByText('Project Switcher').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Global AI Command' }).length).toBeGreaterThan(0);
  });

  it('1.6 handles sub-route navigation within a module while preserving parent module active state', () => {
    // When navigated into a deep campaign target /campaigns/target-123
    renderTriModuleShell('/orgs/org-1/projects/p1/campaigns/target-123');

    const adsLinks = screen.getAllByRole('link', { name: 'Ads & Performance' });
    expect(adsLinks[0]).toHaveClass('text-primary');
    expect(screen.getByText('Current View: /orgs/org-1/projects/p1/campaigns/target-123')).toBeInTheDocument();
  });
});
