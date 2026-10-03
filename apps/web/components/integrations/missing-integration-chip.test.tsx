import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MissingIntegrationChip } from './missing-integration-chip';

describe('MissingIntegrationChip', () => {
  it('renders inline chip with connector name', () => {
    render(
      <MissingIntegrationChip
        orgId="org_test"
        projectId="prj_test"
        connectorId="hubspot"
        metricKey="DEMOS_PIPELINE"
      />,
    );

    expect(screen.getByTestId('missing-integration-chip')).toBeInTheDocument();
    expect(screen.getByText(/Connect HubSpot CRM/i)).toBeInTheDocument();
  });
});
