import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AccountGovernanceHub } from './account-governance-hub';

describe('AccountGovernanceHub', () => {
  it('renders connected platforms, RBAC, and audit log tabs', () => {
    render(<AccountGovernanceHub isDataConnected={true} />);

    expect(screen.getByTestId('account-governance-hub')).toBeDefined();
    expect(screen.getByText('Account Governance, Ad Connections & Audit Logs')).toBeDefined();
    expect(screen.getByText('Meta Graph API')).toBeDefined();
    expect(screen.getByText('Google Ads API')).toBeDefined();
    expect(screen.getByText('TikTok Marketing API')).toBeDefined();
  });

  it('allows switching between tabs', () => {
    render(<AccountGovernanceHub isDataConnected={true} />);

    const rbacTab = screen.getByRole('button', { name: /Team & RBAC Matrix/i });
    fireEvent.click(rbacTab);

    expect(screen.getByText('Sarah Jenkins')).toBeDefined();
    expect(screen.getByText('Alex Rivera')).toBeDefined();

    const auditTab = screen.getByRole('button', { name: /Audit Trail Log/i });
    fireEvent.click(auditTab);

    expect(screen.getByText('Auto-paused ad set #382 (ROAS < 2.0x)')).toBeDefined();
  });

  it('renders missing integration overlay when disconnected', () => {
    render(<AccountGovernanceHub isDataConnected={false} />);

    expect(screen.getByTestId('missing-integration-overlay')).toBeDefined();
  });
});
