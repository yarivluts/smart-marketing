import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';
import { WorkspaceSwitcher } from './workspace-switcher';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const en = enMessages.SidebarWorkspace;
const WORKSPACES = [
  { orgId: 'o1', orgName: 'EasySign', projects: [{ id: 'p1', name: 'EasySign Growth' }, { id: 'p2', name: 'Marketing site' }] },
  { orgId: 'o2', orgName: 'Success Center', projects: [{ id: 'p3', name: 'Success Center' }] },
  { orgId: 'o3', orgName: 'Sandbox', projects: [] },
];

function renderSwitcher(props: Partial<React.ComponentProps<typeof WorkspaceSwitcher>> = {}, locale: 'en' | 'he' = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'he' ? heMessages : enMessages}>
      <WorkspaceSwitcher workspaces={WORKSPACES} currentOrgId="o1" currentProjectId="p1" {...props} />
      <button type="button">outside</button>
    </NextIntlClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('WorkspaceSwitcher', () => {
  it('names where you are - the organization and the project - and stays closed until asked', () => {
    renderSwitcher();
    const trigger = screen.getByTestId('workspace-switcher');
    expect(trigger).toHaveTextContent('EasySign');
    expect(trigger).toHaveTextContent('EasySign Growth');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAccessibleName(en.open.replace('{place}', 'EasySign / EasySign Growth'));
    expect(screen.queryByTestId('workspace-switcher-panel')).toBeNull();
  });

  it('lists every organization with its projects; a project opens straight into it, the current one marked', () => {
    renderSwitcher({ canCreateProject: true });
    fireEvent.click(screen.getByTestId('workspace-switcher'));
    const panel = screen.getByTestId('workspace-switcher-panel');
    expect(within(panel).getAllByRole('link', { name: 'Success Center' })[0]).toHaveAttribute('href', '/orgs/o2');
    expect(within(panel).getAllByRole('link', { name: 'Success Center' })[1]).toHaveAttribute('href', '/orgs/o2/projects/p3');
    expect(within(panel).getByRole('link', { name: 'Marketing site' })).toHaveAttribute('href', '/orgs/o1/projects/p2');
    expect(within(panel).getByRole('link', { name: 'EasySign Growth' })).toHaveAttribute('aria-current', 'page');
    expect(within(panel).getByText(en.noProjects)).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: en.newProject })).toHaveAttribute('href', '/orgs/o1/projects/new');
    expect(within(panel).getByRole('link', { name: en.allOrganizations })).toHaveAttribute('href', '/dashboard');
    // Following a link closes it.
    fireEvent.click(within(panel).getByRole('link', { name: 'Marketing site' }));
    expect(screen.queryByTestId('workspace-switcher-panel')).toBeNull();
  });

  it('on an organization page names its home, and offers no new project without the right', () => {
    renderSwitcher({ currentProjectId: undefined, currentOrgId: 'o2' });
    expect(screen.getByTestId('workspace-switcher')).toHaveTextContent(en.organizationHome);
    fireEvent.click(screen.getByTestId('workspace-switcher'));
    const panel = screen.getByTestId('workspace-switcher-panel');
    expect(within(panel).getAllByRole('link', { name: 'Success Center' })[0]).toHaveAttribute('aria-current', 'page');
    expect(within(panel).queryByRole('link', { name: en.newProject })).toBeNull();
  });

  it('closes on Escape (focus back on the card) and on a click outside, in Hebrew too', () => {
    renderSwitcher({}, 'he');
    const trigger = screen.getByTestId('workspace-switcher');
    fireEvent.click(trigger);
    expect(screen.getByRole('navigation', { name: heMessages.SidebarWorkspace.listLabel })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('workspace-switcher-panel')).toBeNull();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'outside' }));
    expect(screen.queryByTestId('workspace-switcher-panel')).toBeNull();
  });
});
