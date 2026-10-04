import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SetupChecklistHub } from './setup-checklist-hub';
import messages from '../../messages/en.json';
import type { ProjectProfile } from '@/lib/projects/project-profile';

const sampleProfile: ProjectProfile = {
  platformType: 'web',
  businessModel: 'ecommerce_physical',
  transactionType: 'one_time',
  primaryStack: 'shopify',
  verifiedRequirements: ['req_web_sdk'],
  customHiddenModules: [],
};

function renderHub(profile: ProjectProfile = sampleProfile): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SetupChecklistHub
        orgId="org-test"
        projectId="proj-test"
        projectName="Test Store"
        initialProfile={profile}
      />
    </NextIntlClientProvider>,
  );
}

describe('SetupChecklistHub', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders readiness progress and applicable requirements for E-Commerce', () => {
    renderHub();

    expect(screen.getByTestId('setup-checklist-hub')).toBeInTheDocument();
    expect(screen.getByText('System Integration Readiness')).toBeInTheDocument();
    // For e-commerce, checkout stream is applicable
    expect(screen.getByText('Orders & E-Commerce Revenue Stream')).toBeInTheDocument();
    // Web SDK is verified in sampleProfile
    expect(screen.getByTestId('req-card-req_web_sdk')).toBeInTheDocument();
  });

  it('allows 1-click testing & verifying a requirement with live stream telemetry', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        requirementId: 'req_checkout_stream',
        verified: true,
        liveDetected: true,
        recordCount: 8,
        latestRecordAt: new Date().toISOString(),
        verifiedRequirements: ['req_web_sdk', 'req_checkout_stream'],
      }),
    } as Response);

    renderHub();

    const testButtons = screen.getAllByRole('button', { name: /Verify Connection/i });
    expect(testButtons.length).toBeGreaterThan(0);
    fireEvent.click(testButtons[0]);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/orgs/org-test/projects/proj-test/setup-checklist/verify-stream',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            requirementId: 'req_checkout_stream',
            action: 'verify',
            lookbackHours: 24,
            simulateTestEvent: true,
          }),
        }),
      );
    });
  });

  it('copies code snippet to clipboard', async () => {
    renderHub();

    const copyButtons = screen.getAllByRole('button', { name: /Copy Code Snippet/i });
    expect(copyButtons.length).toBeGreaterThan(0);
    fireEvent.click(copyButtons[0]);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
  });

  it('displays hidden reports for e-commerce profile and allows unhiding', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderHub();

    // billingOpsFeed (MRR) and churnReasons should be hidden for e-commerce
    expect(screen.getByText('billingOpsFeed')).toBeInTheDocument();
    expect(screen.getByText('churnReasons')).toBeInTheDocument();

    const unhideButtons = screen.getAllByRole('button', { name: /Unhide/i });
    expect(unhideButtons.length).toBeGreaterThan(0);
    fireEvent.click(unhideButtons[0]);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/orgs/org-test/projects/proj-test',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });
});
