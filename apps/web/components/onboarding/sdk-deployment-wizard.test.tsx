import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SdkDeploymentWizard } from './sdk-deployment-wizard';

describe('SdkDeploymentWizard', () => {
  it('renders SDK snippet, ad connections, and historical sync scope', () => {
    render(<SdkDeploymentWizard isDataConnected={true} />);

    expect(screen.getByTestId('sdk-deployment-wizard')).toBeDefined();
    expect(screen.getByText('Connect Your Paid Media & Deployment Stack')).toBeDefined();
    expect(screen.getByText(/cdn\.growthos\.io\/v1\/loader\.js/)).toBeDefined();
    expect(screen.getByText('Google Ads')).toBeDefined();
    expect(screen.getByText('Meta Ads')).toBeDefined();
    expect(screen.getByText('TikTok Ads')).toBeDefined();
  });

  it('allows connecting Meta Ads and toggling scope', () => {
    render(<SdkDeploymentWizard isDataConnected={true} />);

    const metaBtn = screen.getByRole('button', { name: 'Connect Meta Ads' });
    fireEvent.click(metaBtn);

    expect(screen.getAllByText('Connected').length).toBeGreaterThanOrEqual(1);

    const fastScope = screen.getByRole('button', { name: '90 Days (Fastest)' });
    fireEvent.click(fastScope);
    expect(fastScope.className).toContain('border-primary');
  });

  it('renders missing integration overlay when disconnected', () => {
    render(<SdkDeploymentWizard isDataConnected={false} />);

    expect(screen.getByTestId('missing-integration-overlay')).toBeDefined();
  });
});
