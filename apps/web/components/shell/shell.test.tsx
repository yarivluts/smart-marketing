import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { Header } from './header';
import { WorkspaceSwitcher } from './workspace-switcher';
import { CommandDialog } from './command-dialog';
import { LanguageSwitcher } from './language-switcher';
import { NavShell } from './nav-shell';
import messages from '../../messages/en.json';

const pushMock = vi.fn();
const replaceMock = vi.fn();
const mockUsePathname = vi.fn(() => '/orgs/org-1/projects/p-1/campaigns');

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === 'object' ? JSON.stringify(href) : href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
  usePathname: () => mockUsePathname(),
}));

describe('App Shell Suite', () => {
  const sampleOrgs = [
    { id: 'org-1', name: 'Acme Growth Corp' },
    { id: 'org-2', name: 'Beta Labs' },
  ];

  const sampleProjects = [
    { id: 'p-1', name: 'Main Brand Q3', env: 'prod' },
    { id: 'p-2', name: 'Test Sandbox', env: 'dev' },
  ];

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
    expect(replaceMock).toHaveBeenCalledWith('/orgs/org-1/projects/p-1/campaigns', { locale: 'he' });
  });

  it('renders WorkspaceSwitcher with selected org and project, and switches on selection', async () => {
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

    const betaOrgBtn = screen.getByRole('button', { name: /Beta Labs/i });
    expect(betaOrgBtn).toBeInTheDocument();

    await user.click(betaOrgBtn);
    expect(pushMock).toHaveBeenCalledWith('/orgs/org-2');
  });

  it('renders CommandDialog trigger button and opens modal with instant previews', async () => {
    const user = userEvent.setup();
    render(<CommandDialog orgId="org-1" projectId="p-1" />);

    const searchTrigger = screen.getByRole('button', { name: /open command search/i });
    expect(searchTrigger).toBeInTheDocument();

    await user.click(searchTrigger);

    expect(screen.getByRole('dialog', { name: /command search dialog/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/type a command/i)).toBeInTheDocument();

    const cockpitOptions = screen.getAllByText('Ads & Performance Cockpit');
    expect(cockpitOptions.length).toBeGreaterThan(0);

    const firstOption = screen.getAllByRole('option')[0];
    await user.click(firstOption);
    expect(pushMock).toHaveBeenCalledWith('/orgs/org-1/projects/p-1/campaigns');
  });

  it('renders Header with logo, user email, and switcher integration', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Header
          brandName="GrowthOS"
          organizations={sampleOrgs}
          currentOrgId="org-1"
          projects={sampleProjects}
          currentProjectId="p-1"
          userEmail="alex@acme.com"
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText('GrowthOS')).toBeInTheDocument();
    expect(screen.getByText('alex@acme.com')).toBeInTheDocument();
  });

  it('renders NavShell with full sidebar navigation and content', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <NavShell
          organizations={sampleOrgs}
          currentOrgId="org-1"
          projects={sampleProjects}
          currentProjectId="p-1"
          sections={[
            {
              heading: 'Core Modules',
              items: [
                { href: '/orgs/org-1/projects/p-1/campaigns', label: 'Campaigns', icon: 'Megaphone' },
                { href: '/orgs/org-1/projects/p-1/funnel', label: 'Funnel & Goals', icon: 'Target' },
              ],
            },
          ]}
          mobileTabItems={[
            { href: '/orgs/org-1/projects/p-1/campaigns', label: 'Campaigns', icon: 'Megaphone' },
          ]}
        >
          <div data-testid="test-content">Dashboard Content</div>
        </NavShell>
      </NextIntlClientProvider>,
    );

    expect(screen.getByTestId('test-content')).toBeInTheDocument();
    expect(screen.getAllByText('Campaigns').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Funnel & Goals').length).toBeGreaterThan(0);
  });
});
