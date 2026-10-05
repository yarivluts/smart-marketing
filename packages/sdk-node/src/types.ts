/** Field values GrowthOS stores (the schema registry types: string, number, boolean, timestamp, object, array). */
export type FieldValue =
  string | number | boolean | null | FieldValue[] | { [key: string]: FieldValue };
export type Fields = Record<string, FieldValue>;

/** An event to send. Identity goes in `anonId` / `customerId`; the client puts it inside `properties` as the contract requires. */
export interface TrackInput {
  /** The registered event schema name, e.g. `signup`. */
  event: string;
  /**
   * The idempotency key: a retry with the same id is a duplicate, never counted twice. Use a stable
   * id from your own data (see `eventId()`); a random one is generated when omitted.
   */
  eventId?: string;
  /** When it happened at the source. Defaults to now. */
  ts?: Date | string;
  /** The browser's anonymous id (from the browser SDK's `getAnonId()`), to tie this event to the visit. */
  anonId?: string;
  /** Your own id for the customer/user. */
  customerId?: string;
  properties?: Fields;
}

export interface MeasureInput {
  /** The registered measure schema name, e.g. `ad_spend`. */
  measure: string;
  value: number;
  /** The start of the period the value covers. Defaults to now. */
  ts?: Date | string;
  dimensions?: Fields;
}

/** The wire shapes (see GET /v1/ingest/contract). */
export interface EventRecord {
  event_id: string;
  event: string;
  ts: string;
  properties: Fields;
}
export interface EntityRecord {
  id: string;
  attributes: Fields;
}
export interface MeasureRecord {
  measure: string;
  ts: string;
  value: number;
  dimensions: Fields;
}

export type RecordStatus = 'accepted' | 'quarantined' | 'duplicate';

export interface RejectedRecord {
  /** The record's own id: the event_id, the entity id, or a measure's name|ts|dimensions key. */
  clientId: string;
  status: Exclude<RecordStatus, 'accepted'>;
  /** Why it was quarantined, e.g. `unregistered_field:plan`, `schema_not_registered:signup`. */
  reasons: string[];
}

/** What GrowthOS did with one batch. */
export interface BatchResult {
  batchId: string;
  kind: 'event' | 'entity' | 'measure';
  accepted: number;
  quarantined: number;
  duplicates: number;
  total: number;
  /** Every record that was not accepted (quarantined or duplicate), with reasons. Empty when all landed. */
  rejected: RejectedRecord[];
}

/** The sum of every batch a flush sent. `ok` is false when any record was quarantined or a batch failed. */
export interface FlushResult {
  ok: boolean;
  batches: BatchResult[];
  accepted: number;
  quarantined: number;
  duplicates: number;
  rejected: RejectedRecord[];
  /** Batches that could not be delivered after every retry (they are dropped, not retried later). */
  errors: GrowthOSError[];
}

export class GrowthOSError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 for a network/timeout failure. */
    public readonly status: number,
    /** True when retrying later could succeed (429, 5xx, network). */
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'GrowthOSError';
  }
}

export interface InstallationSchemaCheck {
  name: string;
  kind: 'event' | 'entity' | 'measure' | null;
  status: 'receiving' | 'stale' | 'quarantined' | 'registered_no_data' | 'not_registered';
  registered: boolean;
  lastAcceptedAt: string | null;
  openQuarantined: number;
  quarantineReasons: string[];
  fix: string | null;
}

/** The answer of GET /v1/ingest/verify. */
export interface InstallationVerification {
  key: {
    kind: 'secret' | 'publishable';
    prefix: string;
    scopes: string[];
    allowedOrigins: string[];
  };
  project: { id: string; name: string };
  environment: { id: string; name: string };
  report: { status: 'ok' | 'attention'; schemas: InstallationSchemaCheck[] };
}

/** What `validate*` returns: what ingest would do with each record, without storing anything. */
export interface ValidationResult {
  kind: 'event' | 'entity' | 'measure';
  total: number;
  valid: number;
  invalid: number;
  /** Each record, with the reasons ingest would quarantine it for (empty when valid). */
  records: { clientId: string; valid: boolean; reasons: string[] }[];
}
