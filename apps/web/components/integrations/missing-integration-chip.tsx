'use client';

import * as React from 'react';
import type { GrowthOsMetricKey } from '@growthos/shared';
import { MissingIntegrationAlert } from './missing-integration-alert';

export interface MissingIntegrationChipProps {
  orgId: string;
  projectId: string;
  metricKey?: GrowthOsMetricKey;
  connectorId?: string;
  label?: string;
  onConnected?: (connectorId: string) => void;
  className?: string;
}

export function MissingIntegrationChip({
  orgId,
  projectId,
  metricKey,
  connectorId,
  label,
  onConnected,
  className,
}: MissingIntegrationChipProps): React.ReactElement {
  return (
    <MissingIntegrationAlert
      orgId={orgId}
      projectId={projectId}
      metricKey={metricKey}
      connectorId={connectorId}
      customTitle={label}
      onConnected={onConnected}
      variant="inline_chip"
      className={className}
    />
  );
}
