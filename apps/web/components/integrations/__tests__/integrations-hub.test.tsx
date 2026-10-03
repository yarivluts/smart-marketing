import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../../tests/e2e/helpers/test-harness';
import { IntegrationsHub } from '../integrations-hub';
import React from 'react';

describe('IntegrationsHub Component Suite', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/plugins')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ installs: [{ pluginId: 'stripe', status: 'installed' }] }),
        });
      }
      if (url.includes('/mock-event')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              batchId: 'batch_mock_hub_123',
              accepted: 1,
              connectorStatus: 'connected',
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    });
  });

  const defaultProps = {
    orgId: 'org-test-1',
    projectId: 'proj-test-1',
    projectName: 'Demo Growth Project',
    initialActiveConnectors: ['stripe'],
  };

  it('renders the Integrations Hub with header, health strip, and main navigation tabs', () => {
    renderWithIntl(<IntegrationsHub {...defaultProps} />);

    expect(screen.getByRole('heading', { name: /Integrations Hub/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Live Ingestion/i)).toBeInTheDocument();
    expect(screen.getByText(/Connect and orchestrate data streams for Demo Growth Project/i)).toBeInTheDocument();

    // Health strip
    expect(screen.getByRole('region', { name: /Integrations Health Overview/i })).toBeInTheDocument();

    // Main tabs
    expect(screen.getByTestId('tab-directory')).toBeInTheDocument();
    expect(screen.getByTestId('tab-triage')).toBeInTheDocument();
    expect(screen.getByTestId('tab-tester')).toBeInTheDocument();
  });

  it('allows filtering connectors by category in directory', async () => {
    const user = userEvent.setup();
    renderWithIntl(<IntegrationsHub {...defaultProps} />);

    // Click Ad Networks tab
    const adsCatBtn = screen.getByRole('button', { name: 'Ad Networks' });
    await user.click(adsCatBtn);

    expect(screen.getByText('Google Ads API')).toBeInTheDocument();
    expect(screen.getByText('Meta Marketing API')).toBeInTheDocument();
    expect(screen.queryByText('Stripe Billing')).not.toBeInTheDocument();
  });

  it('allows searching connectors by query', async () => {
    const user = userEvent.setup();
    renderWithIntl(<IntegrationsHub {...defaultProps} />);

    const searchInput = screen.getByLabelText('Search connectors');
    await user.type(searchInput, 'HubSpot');

    expect(screen.getByText('HubSpot CRM')).toBeInTheDocument();
    expect(screen.queryByText('Google Ads API')).not.toBeInTheDocument();
  });

  it('switches to Missing Prerequisites tab when clicking tab or Missing card in health strip', async () => {
    const user = userEvent.setup();
    renderWithIntl(<IntegrationsHub {...defaultProps} />);

    // Click Missing Prerequisites tab
    const triageTabBtn = screen.getByTestId('tab-triage');
    await user.click(triageTabBtn);

    expect(screen.getByTestId('missing-triage-checklist')).toBeInTheDocument();
    expect(screen.getByText(/Missing Integrations Triage/i)).toBeInTheDocument();
  });

  it('switches to Live Event Tester tab and can trigger a test event', async () => {
    const user = userEvent.setup();
    renderWithIntl(<IntegrationsHub {...defaultProps} />);

    const testerTabBtn = screen.getByTestId('tab-tester');
    await user.click(testerTabBtn);

    expect(screen.getByTestId('live-event-tester')).toBeInTheDocument();
    const testBtn = screen.getByRole('button', { name: /Send Simulated Test Event/i });
    await user.click(testBtn);

    await waitFor(() => {
      expect(screen.getByText(/Event received!/i)).toBeInTheDocument();
    });
  });

  it('opens Setup Modal when clicking + New Connection or Connect on a connector', async () => {
    const user = userEvent.setup();
    renderWithIntl(<IntegrationsHub {...defaultProps} />);

    // Click + New Connection
    const newConnBtn = screen.getByRole('button', { name: '+ New Connection' });
    await user.click(newConnBtn);

    expect(screen.getByRole('dialog', { name: /Setup Stripe Billing/i })).toBeInTheDocument();
    expect(screen.getByTestId('step-1-credentials')).toBeInTheDocument();

    // Close modal
    const closeBtn = screen.getByRole('button', { name: 'Close setup modal' });
    await user.click(closeBtn);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('completes step-by-step wizard through all 4 steps', async () => {
    const user = userEvent.setup();
    renderWithIntl(<IntegrationsHub {...defaultProps} />);

    // Click + New Connection
    const newConnBtn = screen.getByRole('button', { name: '+ New Connection' });
    await user.click(newConnBtn);

    // Step 1 -> Enter API key -> Continue
    const apiKeyInput = screen.getByLabelText('API key');
    await user.type(apiKeyInput, 'sk_test_mock_secret_key');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 2 -> Webhook URL -> Copy URL -> Continue
    expect(screen.getByTestId('step-2-webhook')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy URL' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 3 -> Signing Secret -> Copy Secret -> Continue
    expect(screen.getByTestId('step-3-secret')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy Secret' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 4 -> Live Tester -> Send test event -> Complete Setup
    expect(screen.getByTestId('step-4-tester')).toBeInTheDocument();
    const testBtn = screen.getByRole('button', { name: /Send Simulated Test Event/i });
    await user.click(testBtn);

    await waitFor(() => {
      expect(screen.getByText(/Event received!/i)).toBeInTheDocument();
    });

    const completeBtn = screen.getByRole('button', { name: 'Complete Setup' });
    await user.click(completeBtn);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('resolves item from triage checklist and opens setup modal for that item', async () => {
    const user = userEvent.setup();
    renderWithIntl(<IntegrationsHub {...defaultProps} />);

    // Go to triage tab
    const triageTabBtn = screen.getByTestId('tab-triage');
    await user.click(triageTabBtn);

    // Click Configure on one of the items
    const configureBtns = screen.getAllByRole('button', { name: /Configure/i });
    if (configureBtns.length > 0) {
      await user.click(configureBtns[0]);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    }
  });
});
