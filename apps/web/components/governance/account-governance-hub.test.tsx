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
    syncRate: 'Real-time Webhook',
    scopes: ['ads_read', 'ads_management'],
    expiresIn: 'Active KMS Vault',
  },
  {
    name: 'Google Ads API',
    type: 'Search & Performance Max',
    status: 'degraded',
    accounts: '0 Connected Scopes',
    syncRate: 'Real-time Webhook',
    scopes: [],
    expiresIn: 'Scopes Unassigned',
  },
  {
    name: 'TikTok Marketing API',
    type: 'Short-Form Video',
    status: 'unverified',
    accounts: '0 Connected Scopes',
    syncRate: 'Sync Paused',
    scopes: ['campaign_read'],
    expiresIn: 'Awaiting Token',
  },
  {
    name: 'Stripe Billing',
    type: 'Payment Gateway',
    status: 'disconnected',
    accounts: '1 Connected Scope',
    syncRate: 'Sync Paused',
    scopes: ['read'],
    expiresIn: 'Revoked',
  },
];

const mockMembers: GovernanceMember[] = [
  { name: 'Sarah Jenkins', initials: 'SJ', email: 'sarah@agency.com', role: 'Agency Admin', lastActive: 'Active now', status: 'active' },
  { name: 'Alex Rivera', initials: 'AR', email: 'alex@agency.com', role: 'Media Buyer', lastActive: '2h ago', status: 'active' },
  { name: 'David Kim', initials: 'DK', email: 'david@client.com', role: 'Client Viewer', lastActive: 'Invited (Pending)', status: 'invited' },
  { name: 'Elena Rostova', initials: 'ER', email: 'elena@agency.com', role: 'Experimenter', lastActive: 'Access Suspended', status: 'suspended' },
];

const mockAuditLogs: AuditLogEntry[] = [
  {
    id: 'a-1',
    timestamp: '10 mins ago',
    actor: 'Autonomous Guardrail Bot',
    action: 'Auto-paused ad set #382 (ROAS < 2.0x)',
    target: 'Meta Ads: Lawyers Retargeting',
    status: 'warning',
  },
  {
    id: 'a-2',
    timestamp: '25 mins ago',
    actor: 'sarah@agency.com',
    action: 'API_KEY.MINT',
    target: 'Project 49021',
    status: 'success',
  },
  {
    id: 'a-3',
    timestamp: '1 hour ago',
    actor: 'webhook:collector',
    action: 'INGEST.BATCH.FAILED',
    target: 'Organization',
    status: 'error',
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
    expect(screen.getByText('Stripe Billing')).toBeDefined();

    // Verify platform status pills
    expect(screen.getByText('Connected')).toBeDefined();
    expect(screen.getByText('Degraded')).toBeDefined();
    expect(screen.getByText('Unverified')).toBeDefined();
    expect(screen.getByText('Disconnected')).toBeDefined();

    // Header counter reflects connected and degraded platforms
    expect(screen.getByText('1 Connected APIs (1 Degraded)')).toBeDefined();
  });

  it('renders realistic member statuses and handles switching between tabs', () => {
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
    expect(screen.getByText('sarah@agency.com')).toBeDefined();
    expect(screen.getByText('David Kim')).toBeDefined();
    expect(screen.getByText('Invited (Pending)')).toBeDefined();
    expect(screen.getByText('Elena Rostova')).toBeDefined();
    expect(screen.getByText('Access Suspended')).toBeDefined();

    const auditTab = screen.getByRole('button', { name: /Audit Trail Log/i });
    fireEvent.click(auditTab);

    expect(screen.getByText('Auto-paused ad set #382 (ROAS < 2.0x)')).toBeDefined();
    expect(screen.getByText('Executed')).toBeDefined();
    expect(screen.getByText('Warning')).toBeDefined();
    expect(screen.getByText('Failed')).toBeDefined();
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
