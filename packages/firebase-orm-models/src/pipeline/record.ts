import type { SchemaDefKind } from '../models/schema-def.model';

/** The fields carried by one ingest record through the whole pipeline — published to the outbox (`transport.ts`) and landed in the warehouse sink (`sink.ts`) unchanged. One shared shape so the two hops can't silently drift apart. */
export interface PipelineRecordEnvelope {
  organizationId: string;
  projectId: string;
  environmentId: string;
  batchId: string;
  kind: SchemaDefKind;
  schemaName: string;
  clientId: string;
  payload: Record<string, unknown>;
}
