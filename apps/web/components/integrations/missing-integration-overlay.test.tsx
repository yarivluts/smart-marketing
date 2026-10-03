import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MissingIntegrationOverlay } from './missing-integration-overlay';

describe('MissingIntegrationOverlay', () => {
  it('renders blurred overlay over children when integration is missing', () => {
    render(
      <MissingIntegrationOverlay
        orgId="org_test"
        projectId="prj_test"
        metricKey="CONVERSION_FUNNEL"
        connectorId="growthos_sdk"
        isMissing={true}
      >
        <div data-testid="child-chart">Active Funnel Chart</div>
      </MissingIntegrationOverlay>,
    );

    expect(screen.getByTestId('missing-integration-overlay-container')).toBeInTheDocument();
    expect(screen.getByTestId('missing-integration-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('missing-integration-alert')).toBeInTheDocument();
    expect(screen.getByTestId('child-chart')).toBeInTheDocument();
  });

  it('renders only children cleanly without overlay when isMissing is false', () => {
    render(
      <MissingIntegrationOverlay
        orgId="org_test"
        projectId="prj_test"
        metricKey="MRR"
        connectorId="stripe"
        isMissing={false}
      >
        <div data-testid="child-chart">Active Funnel Chart</div>
      </MissingIntegrationOverlay>,
    );

    expect(screen.queryByTestId('missing-integration-overlay')).not.toBeInTheDocument();
    expect(screen.getByTestId('child-chart')).toBeInTheDocument();
  });
});
