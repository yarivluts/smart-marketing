import type { TrackingAlertModel, TrackingAlertStatus } from '@growthos/firebase-orm-models';

/**
 * A plain, serializable projection of one `TrackingAlertModel` (KAN-36).
 * Client components can only ever receive plain data across the RSC
 * boundary, never an `@arbel/firebase-orm` model instance — same reasoning
 * as `toOrchestrationRunView`.
 */
export interface TrackingAlertView {
  id: string;
  schemaName: string;
  /** The raw environment `name` (`dev`/`staging`/`prod`) — translate via the `EnvBadge` namespace, same as the keys page's own environment badges. */
  environmentName: string;
  status: TrackingAlertStatus;
  detectedAt: string;
  lastSeenAt: string;
  lastCheckedAt: string;
  resolvedAt: string | null;
}

/** `environmentName` comes from the caller's own `listEnvironmentsForProject` lookup — `TrackingAlertModel` only stores `environment_id`, same "resolve the name server-side, pass a plain string across the RSC boundary" pattern the keys page's `environmentNameById` map already uses. */
export function toTrackingAlertView(alert: TrackingAlertModel, environmentName: string): TrackingAlertView {
  return {
    id: alert.id,
    schemaName: alert.schema_name,
    environmentName,
    status: alert.status,
    detectedAt: alert.detected_at,
    lastSeenAt: alert.last_seen_at,
    lastCheckedAt: alert.last_checked_at,
    resolvedAt: alert.resolved_at ?? null,
  };
}

/** The `SchemaRegistry` translation key for one alert's status label. */
const TRACKING_ALERT_STATUS_LABEL_KEYS: Record<TrackingAlertStatus, 'trackingAlertStatusActive' | 'trackingAlertStatusResolved'> = {
  active: 'trackingAlertStatusActive',
  resolved: 'trackingAlertStatusResolved',
};

export function trackingAlertStatusLabelKey(
  status: TrackingAlertStatus,
): 'trackingAlertStatusActive' | 'trackingAlertStatusResolved' {
  return TRACKING_ALERT_STATUS_LABEL_KEYS[status];
}
