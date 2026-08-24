import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { FeatureLaunchpad } from './feature-launchpad';
import messages from '../../messages/en.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : String(href)} {...props}>
      {children}
    </a>
  ),
}));

function renderLaunchpad(permissionsOverhead = {}) {
  const defaultPermissions = {
    canManageBoards: true,
    canViewBoards: true,
    canManageSchemas: true,
    canManageMetrics: true,
    canViewIngestHealth: true,
    canManagePlugins: true,
    canRunAutomation: true,
    canManageKeys: true,
    canManageProjects: true,
    canViewAuditLog: true,
    ...permissionsOverhead,
  };

  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FeatureLaunchpad
        orgId="org-1"
        projectId="proj-1"
        projectName="Main Project"
        permissions={defaultPermissions}
      />
    </NextIntlClientProvider>,
  );
}

describe('FeatureLaunchpad', () => {
  it('renders all main capability categories and cards when authorized', () => {
    renderLaunchpad();

    expect(screen.getByRole('heading', { name: 'Analytics & Growth' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Data Pipelines & Ingestion' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI & Autonomous Action' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Security & Governance' })).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Boards' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Goals' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ingest health' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'API keys' })).toBeInTheDocument();
  });

  it('hides write-gated cards when permissions are missing', () => {
    renderLaunchpad({
      canManageBoards: false,
      canViewBoards: true,
      canManageKeys: false,
    });

    expect(screen.getByRole('heading', { name: 'Boards' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Goals' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'API keys' })).not.toBeInTheDocument();
  });
});
