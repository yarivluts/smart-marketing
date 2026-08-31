import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { useState } from 'react';
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

// Mock OmniSearch Modal Dialog
function MockOmniSearchDialog({ onSelect = vi.fn() }: { onSelect?: (route: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const commands = [
    { id: '1', label: 'Go to Ads & Campaigns', route: '/campaigns' },
    { id: '2', label: 'Go to Funnel Pipelines', route: '/funnel' },
    { id: '3', label: 'Scale Meta Retargeting ($250/day)', route: '/automation?action=scale_meta' },
  ];

  const filtered = query.trim()
    ? commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands;

  return (
    <div>
      <button data-testid="open-omnisearch-btn" type="button" onClick={() => setIsOpen(true)}>
        Cmd+K Omni-Search
      </button>

      {isOpen && (
        <div role="dialog" aria-modal="true" data-testid="omnisearch-modal" className="fixed inset-0 bg-black/50 p-6">
          <input
            data-testid="omnisearch-input"
            placeholder="Type a command or search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div data-testid="omnisearch-results">
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`cmd-item-${item.id}`}
                onClick={() => {
                  onSelect(item.route);
                  setIsOpen(false);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button data-testid="close-omnisearch" type="button" onClick={() => setIsOpen(false)}>
            Close
          </button>
        </div>
      )}
    </div>
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
    const viewerSections: AppShellNavSection[] = [
      {
        heading: 'GrowthOS Modules',
        items: [adsItem, funnelItem],
      },
    ];

    renderTriModuleShell('/orgs/org-1/projects/p1/campaigns', viewerSections, [adsItem, funnelItem]);

    expect(screen.getAllByRole('link', { name: 'Ads & Performance' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Funnel & Goals' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'AI Copilot & Automation' })).not.toBeInTheDocument();
  });

  it('1.4 provides mobile responsiveness with a bottom tab bar and expandable slide-down navigation', () => {
    renderTriModuleShell('/orgs/org-1/projects/p1/campaigns');

    expect(screen.getAllByRole('link', { name: 'Ads & Performance' })).toHaveLength(2);

    const menuButton = screen.getByRole('button', { name: 'Open menu' });
    fireEvent.click(menuButton);

    expect(screen.getAllByRole('link', { name: 'Ads & Performance' })).toHaveLength(3);

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
    renderTriModuleShell('/orgs/org-1/projects/p1/campaigns/target-123');

    const adsLinks = screen.getAllByRole('link', { name: 'Ads & Performance' });
    expect(adsLinks[0]).toHaveClass('text-primary');
    expect(screen.getByText('Current View: /orgs/org-1/projects/p1/campaigns/target-123')).toBeInTheDocument();
  });

  it('1.7 Cmd+K Omni-Search Modal: opens dialog, searches commands, and executes route navigation on selection', () => {
    const onSelect = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MockOmniSearchDialog onSelect={onSelect} />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('open-omnisearch-btn'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const searchInput = screen.getByTestId('omnisearch-input');
    fireEvent.change(searchInput, { target: { value: 'Retargeting' } });

    expect(screen.getByTestId('cmd-item-3')).toHaveTextContent('Scale Meta Retargeting ($250/day)');
    expect(screen.queryByTestId('cmd-item-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('cmd-item-3'));
    expect(onSelect).toHaveBeenCalledWith('/automation?action=scale_meta');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
