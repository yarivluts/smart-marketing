'use client';

import * as React from 'react';
import {
  METRIC_INGESTION_MAPPINGS,
  type GrowthOsMetricKey,
  type MetricIngestionRequirement,
} from '@growthos/shared';
import { useIntegrationStatus } from '@/hooks/use-integration-status';
import { MissingIntegrationAlert } from './missing-integration-alert';
import { cn } from '@/lib/utils';

export interface MissingIntegrationOverlayProps {
  children: React.ReactNode;
  orgId: string;
  projectId: string;
  metricKey?: GrowthOsMetricKey;
  connectorId?: string;
  requirement?: Partial<MetricIngestionRequirement>;
  isMissing?: boolean;
  customTitle?: string;
  customMissingPoints?: string[];
  customImpactMetrics?: string[];
  onConnected?: (connectorId: string) => void;
  className?: string;
  overlayClassName?: string;
}

export function MissingIntegrationOverlay({
  children,
  orgId,
  projectId,
  metricKey,
  connectorId: explicitConnectorId,
  requirement: explicitRequirement,
  isMissing: explicitIsMissing,
  customTitle,
  customMissingPoints,
  customImpactMetrics,
  onConnected,
  className,
  overlayClassName,
}: MissingIntegrationOverlayProps): React.ReactElement {
  const { isConnectorActive } = useIntegrationStatus({
    orgId,
    projectId,
    metricKey,
  });

  const mapping = metricKey ? METRIC_INGESTION_MAPPINGS[metricKey] : undefined;
  const targetConnectorId =
    explicitConnectorId ||
    explicitRequirement?.supportedConnectors?.[0] ||
    mapping?.supportedConnectors[0] ||
    'stripe';

  const isConnected = isConnectorActive(targetConnectorId);
  const showOverlay = explicitIsMissing !== undefined ? explicitIsMissing : !isConnected;

  if (!showOverlay) {
    return <>{children}</>;
  }

  return (
    <div
      data-testid="missing-integration-overlay-container"
      className={cn('relative min-h-[240px] w-full overflow-hidden rounded-2xl', className)}
    >
      {/* Background content with blur and opacity reduction */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none opacity-25 filter blur-[3px] transition-all"
      >
        {children}
      </div>

      {/* Centered Glassmorphism Overlay */}
      <div
        data-testid="missing-integration-overlay"
        className={cn(
          'absolute inset-0 z-20 flex items-center justify-center p-4 bg-background/60 backdrop-blur-sm animate-fade-in',
          overlayClassName,
        )}
      >
        <div className="w-full max-w-xl shadow-xl">
          <MissingIntegrationAlert
            orgId={orgId}
            projectId={projectId}
            metricKey={metricKey}
            connectorId={targetConnectorId}
            requirement={explicitRequirement}
            customTitle={customTitle}
            customMissingPoints={customMissingPoints}
            customImpactMetrics={customImpactMetrics}
            onConnected={onConnected}
            variant="banner"
          />
        </div>
      </div>
    </div>
  );
}
