import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MissingIntegrationAlert } from './missing-integration-alert';

describe('MissingIntegrationAlert', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Mock navigator.clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders missing integration banner with missing data points, impacted metrics, and quick action buttons', () => {
    render(
      <MissingIntegrationAlert
        orgId="org_test"
        projectId="prj_test"
        metricKey="MRR"
        connectorId="stripe"
      />,
    );

    expect(screen.getByTestId('missing-integration-alert')).toBeInTheDocument();
    expect(screen.getByText(/Missing Integration: Stripe Billing/i)).toBeInTheDocument();
    expect(screen.getByText('Setup Required')).toBeInTheDocument();
    expect(screen.getByText(/Monthly Recurring Revenue/i)).toBeInTheDocument();

    // Quick action buttons
    expect(screen.getByRole('button', { name: /1-Click Connect/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Test \/ Send Mock Event/i })).toBeInTheDocument();
    expect(screen.getByText(/Copy 1-line Script/i)).toBeInTheDocument();
    expect(screen.getByText(/Developer Guide/i)).toBeInTheDocument();
  });

  it('handles 1-line script copy button click with clipboard write', async () => {
    render(
      <MissingIntegrationAlert
        orgId="org_test"
        projectId="prj_test_123"
        metricKey="CAC"
        connectorId="google_ads"
      />,
    );

    const copyBtn = screen.getByText(/Copy 1-line Script/i);
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('prj_test_123'),
    );
  });

  it('opens 1-Click Connect modal when clicking 1-Click Connect button', () => {
    render(
      <MissingIntegrationAlert
        orgId="org_test"
        projectId="prj_test"
        connectorId="stripe"
      />,
    );

    const connectBtn = screen.getByRole('button', { name: /1-Click Connect/i });
    fireEvent.click(connectBtn);

    expect(screen.getByText(/1-Click Connect Stripe Billing/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Authorize & Connect/i })).toBeInTheDocument();
  });

  it('emits mock event when clicking Send Mock Event button and transitions status', async () => {
    const onConnected = vi.fn();
    global.fetch = vi.fn().mockImplementation((url) => {
      if (String(url).includes('/mock-event')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              batchId: 'batch_mock_999',
              accepted: 1,
              connectorStatus: 'connected',
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ installs: [] }),
      });
    });

    render(
      <MissingIntegrationAlert
        orgId="org_test"
        projectId="prj_test"
        connectorId="meta_ads"
        metricKey="ROI"
        onConnected={onConnected}
      />,
    );

    const mockBtn = screen.getByRole('button', { name: /Test \/ Send Mock Event/i });
    fireEvent.click(mockBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/integrations/mock-event'),
        expect.objectContaining({
          method: 'POST',
        }),
      );
      expect(onConnected).toHaveBeenCalledWith('meta_ads');
    });
  });

  it('renders inline chip variant when variant="inline_chip"', () => {
    render(
      <MissingIntegrationAlert
        orgId="org_test"
        projectId="prj_test"
        connectorId="growthos_sdk"
        variant="inline_chip"
      />,
    );

    expect(screen.getByTestId('missing-integration-chip')).toBeInTheDocument();
    expect(screen.getByText(/Connect GrowthOS Web Telemetry SDK/i)).toBeInTheDocument();
  });
});
