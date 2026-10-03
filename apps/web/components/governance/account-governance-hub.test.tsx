import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  AccountGovernanceHub,
  type ConnectedPlatform,
  type GovernanceMember,
  type AuditLogEntry,
} from './account-governance-hub';

const mockPlatforms: ConnectedPlatform[] = [
  {
    name: 'Meta Graph API',
    type: 'Social Paid Media',
    status: 'connected',
    accounts: '3 Active Ad Accounts',
    syncRate: '60s polling',
    scopes: ['ads_read', 'ads_management'],
    expiresIn: '54 days',
  },
  {
    name: 'Google Ads API',
    type: 'Search & Performance Max',
    status: 'connected',
    accounts: '2 Active CID Accounts (404-892)',
    syncRate: 'Real-time Webhook',
    scopes: ['read', 'guardrail_write'],
    expiresIn: 'Active OAuth',
  },
  {
    name: 'TikTok Marketing API',
    type: 'Short-Form Video',
    status: 'connected',
    accounts: '1 Active (adv_984210)',
    syncRate: '5m polling',
    scopes: ['campaign_read', 'creative_write'],
    expiresIn: '89 days',
  },
];

const mockMembers: GovernanceMember[] = [
  { name: 'Sarah Jenkins', initials: 'SJ', role: 'Agency Admin', lastActive: 'Online now' },
  { name: 'Alex Rivera', initials: 'AR', role: 'Media Buyer', lastActive: '2h ago' },
];

const mockAuditLogs: AuditLogEntry[] = [
  {
    id: 'a-1',
    timestamp: '10 mins ago',
    actor: 'Autonomous Guardrail Bot',
    action: 'Auto-paused ad set #382 (ROAS < 2.0x)',
    target: 'Meta Ads: Lawyers Retargeting',
    status: 'success',
  },
];

describe('AccountGovernanceHub', () => {
  it('renders connected platforms, RBAC, and audit log tabs with provided data', () => {
    render(
      <AccountGovernanceHub
        isDataConnected={true}
        initialPlatforms={mockPlatforms}
        initialMembers={mockMembers}
        initialAuditLogs={mockAuditLogs}
      />
    );

    expect(screen.getByTestId('account-governance-hub')).toBeDefined();
    expect(screen.getByText('Account Governance, Ad Connections & Audit Logs')).toBeDefined();
    expect(screen.getByText('Meta Graph API')).toBeDefined();
    expect(screen.getByText('Google Ads API')).toBeDefined();
    expect(screen.getByText('TikTok Marketing API')).toBeDefined();
  });

  it('allows switching between tabs', () => {
    render(
      <AccountGovernanceHub
        isDataConnected={true}
        initialPlatforms={mockPlatforms}
        initialMembers={mockMembers}
        initialAuditLogs={mockAuditLogs}
      />
    );

    const rbacTab = screen.getByRole('button', { name: /Team & RBAC Matrix/i });
    fireEvent.click(rbacTab);

    expect(screen.getByText('Sarah Jenkins')).toBeDefined();
    expect(screen.getByText('Alex Rivera')).toBeDefined();

    const auditTab = screen.getByRole('button', { name: /Audit Trail Log/i });
    fireEvent.click(auditTab);

    expect(screen.getByText('Auto-paused ad set #382 (ROAS < 2.0x)')).toBeDefined();
  });

  it('renders honest empty states when no data is provided', () => {
    render(<AccountGovernanceHub isDataConnected={true} />);

    expect(screen.getByText('No Connected Platforms')).toBeDefined();

    const rbacTab = screen.getByRole('button', { name: /Team & RBAC Matrix/i });
    fireEvent.click(rbacTab);
    expect(screen.getByText('No Team Members Found')).toBeDefined();

    const auditTab = screen.getByRole('button', { name: /Audit Trail Log/i });
    fireEvent.click(auditTab);
    expect(screen.getByText('No Audit Logs Recorded')).toBeDefined();
  });

  it('renders missing integration overlay when disconnected', () => {
    render(<AccountGovernanceHub isDataConnected={false} />);

    expect(screen.getByTestId('missing-integration-overlay')).toBeDefined();
  });
});
