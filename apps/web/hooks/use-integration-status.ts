'use client';

import * as React from 'react';
import {
  METRIC_INGESTION_MAPPINGS,
  type GrowthOsMetricKey,
  type CanonicalEventType,
  type FieldRequirement,
  type MetricIngestionRequirement,
  type RecommendedQuickAction,
} from '@growthos/shared';

export type { GrowthOsMetricKey, CanonicalEventType, FieldRequirement, MetricIngestionRequirement, RecommendedQuickAction };

export interface UseIntegrationStatusOptions {
  orgId: string;
  projectId: string;
  metricKey?: GrowthOsMetricKey;
  connectorId?: string;
  initialActiveConnectors?: string[];
}

export interface MockEventResponse {
  ok: boolean;
  batchId?: string;
  accepted?: number;
  quarantined?: number;
  connectorStatus?: 'connected' | 'degraded' | 'missing';
  emittedPayload?: Record<string, unknown>;
  error?: string;
}

export interface MetricGapDetails {
  metricKey: GrowthOsMetricKey;
  name: string;
  category: string;
  description: string;
  missingImpactDescription: string;
  isComplete: boolean;
  requiredConnectors: string[];
  missingConnectors: string[];
  activeConnectors: string[];
  requiredEventTypes: CanonicalEventType[];
  missingEventTypes: CanonicalEventType[];
  requiredFields: FieldRequirement[];
  recommendedQuickAction: RecommendedQuickAction;
}

export interface UseIntegrationStatusResult {
  activeConnectors: string[];
  connectorStatuses: Record<string, 'connected' | 'missing' | 'degraded'>;
  isConnectorActive: (connectorId: string) => boolean;
  getMetricGap: (metricKey: GrowthOsMetricKey) => MetricGapDetails;
  currentMetricGap: MetricGapDetails | null;
  isCurrentMetricReady: boolean;
  allMetricGaps: MetricGapDetails[];
  missingMetrics: GrowthOsMetricKey[];
  readyMetrics: GrowthOsMetricKey[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  emitMockEvent: (
    connectorId: string,
    eventType?: CanonicalEventType,
    scenario?: string,
  ) => Promise<MockEventResponse>;
}

// Memory cache for optimistic state updates across component unmounts in session
const memoryConnectorStatusCache = new Map<string, Set<string>>();

function getCacheKey(orgId: string, projectId: string): string {
  return `${orgId}:${projectId}`;
}

export function useIntegrationStatus(options: UseIntegrationStatusOptions): UseIntegrationStatusResult {
  const { orgId, projectId, metricKey, initialActiveConnectors = [] } = options;
  const cacheKey = getCacheKey(orgId, projectId);

  const [activeConnectorsSet, setActiveConnectorsSet] = React.useState<Set<string>>(() => {
    const cached = memoryConnectorStatusCache.get(cacheKey);
    if (cached && cached.size > 0) {
      return new Set(cached);
    }
    return new Set(initialActiveConnectors);
  });

  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<Error | null>(null);

  // Sync cache
  React.useEffect(() => {
    memoryConnectorStatusCache.set(cacheKey, activeConnectorsSet);
  }, [cacheKey, activeConnectorsSet]);

  const fetchActiveConnectors = React.useCallback(async () => {
    if (!orgId || !projectId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/plugins`);
      if (response.ok) {
        const data = await response.json();
        const installedPluginIds: string[] = Array.isArray(data.installs)
          ? data.installs
              .filter((install: { status?: string }) => install.status === 'installed' || install.status === 'active')
              .map((install: { pluginId: string }) => install.pluginId)
          : [];

        setActiveConnectorsSet((prev) => {
          const next = new Set(prev);
          for (const id of installedPluginIds) {
            next.add(id);
          }
          // Normalizations for common connector keys
          if (next.has('ga4')) next.add('google_analytics');
          if (next.has('stripe')) next.add('stripe_billing');
          return next;
        });
      }
    } catch (err) {
      // Don't treat network error as fatal if initial state was supplied
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [orgId, projectId]);

  React.useEffect(() => {
    if (initialActiveConnectors.length === 0) {
      void fetchActiveConnectors();
    }
  }, [fetchActiveConnectors, initialActiveConnectors.length]);

  const isConnectorActive = React.useCallback(
    (connectorId: string): boolean => {
      if (activeConnectorsSet.has(connectorId)) return true;
      // Also match aliases
      if (connectorId === 'stripe' && (activeConnectorsSet.has('stripe_billing') || activeConnectorsSet.has('stripe'))) return true;
      if (connectorId === 'growthos_sdk' && (activeConnectorsSet.has('sdk') || activeConnectorsSet.has('tracking_sdk'))) return true;
      return false;
    },
    [activeConnectorsSet],
  );

  const getMetricGap = React.useCallback(
    (key: GrowthOsMetricKey): MetricGapDetails => {
      const mapping = METRIC_INGESTION_MAPPINGS[key];
      if (!mapping) {
        return {
          metricKey: key,
          name: key,
          category: 'unknown',
          description: '',
          missingImpactDescription: '',
          isComplete: true,
          requiredConnectors: [],
          missingConnectors: [],
          activeConnectors: [],
          requiredEventTypes: [],
          missingEventTypes: [],
          requiredFields: [],
          recommendedQuickAction: {
            type: 'oauth',
            connectorId: 'stripe',
            label: 'Connect Integration',
          },
        };
      }

      // Check which required connectors are connected
      const activeForMetric = mapping.supportedConnectors.filter((c) => isConnectorActive(c));
      const missingConnectors = mapping.supportedConnectors.filter((c) => !isConnectorActive(c));

      // If at least one primary connector for each required stream category is present, or any supported connector is active
      const isComplete = activeForMetric.length > 0;

      const missingEventTypes = isComplete ? [] : [...mapping.requiredEventTypes];
      const missingFields = isComplete ? [] : [...mapping.requiredFields];

      return {
        metricKey: key,
        name: mapping.name,
        category: mapping.category,
        description: mapping.description,
        missingImpactDescription: mapping.missingImpactDescription,
        isComplete,
        requiredConnectors: mapping.supportedConnectors,
        missingConnectors,
        activeConnectors: activeForMetric,
        requiredEventTypes: mapping.requiredEventTypes,
        missingEventTypes,
        requiredFields: missingFields,
        recommendedQuickAction: mapping.recommendedQuickAction,
      };
    },
    [isConnectorActive],
  );

  const currentMetricGap = React.useMemo(() => {
    return metricKey ? getMetricGap(metricKey) : null;
  }, [metricKey, getMetricGap]);

  const isCurrentMetricReady = currentMetricGap ? currentMetricGap.isComplete : true;

  const allMetricGaps = React.useMemo(() => {
    return (Object.keys(METRIC_INGESTION_MAPPINGS) as GrowthOsMetricKey[]).map(getMetricGap);
  }, [getMetricGap]);

  const missingMetrics = React.useMemo(() => {
    return allMetricGaps.filter((gap) => !gap.isComplete).map((gap) => gap.metricKey);
  }, [allMetricGaps]);

  const readyMetrics = React.useMemo(() => {
    return allMetricGaps.filter((gap) => gap.isComplete).map((gap) => gap.metricKey);
  }, [allMetricGaps]);

  const activeConnectors = React.useMemo(() => {
    return Array.from(activeConnectorsSet);
  }, [activeConnectorsSet]);

  const connectorStatuses = React.useMemo(() => {
    const statuses: Record<string, 'connected' | 'missing' | 'degraded'> = {};
    const allKnown = [
      'stripe',
      'google_ads',
      'meta_ads',
      'tiktok_ads',
      'growthos_sdk',
      'hubspot',
      'salesforce',
      'chargebee',
      'paddle',
      'recurly',
    ];
    for (const id of allKnown) {
      statuses[id] = isConnectorActive(id) ? 'connected' : 'missing';
    }
    return statuses;
  }, [isConnectorActive]);

  const emitMockEvent = React.useCallback(
    async (
      connectorId: string,
      eventType?: CanonicalEventType,
      scenario?: string,
    ): Promise<MockEventResponse> => {
      try {
        const res = await fetch(`/api/orgs/${orgId}/projects/${projectId}/integrations/mock-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectorId, eventType, scenario }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: 'Request failed' }));
          return {
            ok: false,
            error: errData.message || errData.error || `HTTP ${res.status}`,
          };
        }

        const data: MockEventResponse = await res.json();
        if (data.ok) {
          // Instant optimistic transition to Connected
          setActiveConnectorsSet((prev) => {
            const next = new Set(prev);
            next.add(connectorId);
            if (connectorId === 'stripe') next.add('stripe_billing');
            if (connectorId === 'growthos_sdk') next.add('sdk');
            memoryConnectorStatusCache.set(cacheKey, next);
            return next;
          });
        }
        return data;
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    [orgId, projectId, cacheKey],
  );

  return {
    activeConnectors,
    connectorStatuses,
    isConnectorActive,
    getMetricGap,
    currentMetricGap,
    isCurrentMetricReady,
    allMetricGaps,
    missingMetrics,
    readyMetrics,
    isLoading,
    error,
    refetch: fetchActiveConnectors,
    emitMockEvent,
  };
}
