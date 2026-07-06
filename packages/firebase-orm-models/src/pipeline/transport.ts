import { PipelineMessageModel } from '../models/pipeline-message.model';
import type { SchemaDefKind } from '../models/schema-def.model';

export interface PipelinePublishInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  batchId: string;
  kind: SchemaDefKind;
  schemaName: string;
  clientId: string;
  payload: Record<string, unknown>;
}

/**
 * The "publish an accepted record" boundary (KAN-33, plan `13 §E3.3`). Stands in for a real Pub/Sub
 * topic per project (plan `08 §generic-platform`) until KAN-18 provisions one — a `GcpPubSubTransport`
 * publishing to a real topic (with a push subscription HTTP endpoint calling
 * `drainPendingPipelineMessages`) is a drop-in swap behind this same interface; nothing in
 * `pipeline.service.ts` would need to change.
 */
export interface PipelineTransport {
  publish(message: PipelinePublishInput): Promise<PipelineMessageModel>;
}

/**
 * Firestore-backed durable outbox: `publish` persists a `queued` `PipelineMessageModel` rather than
 * handing off to a real broker. Durability here is what makes the "at least once" delivery property
 * meaningful even though there's no real Pub/Sub retry/ack machinery behind it yet.
 */
export class FirestoreOutboxTransport implements PipelineTransport {
  async publish(input: PipelinePublishInput): Promise<PipelineMessageModel> {
    const message = new PipelineMessageModel();
    message.organization_id = input.organizationId;
    message.project_id = input.projectId;
    message.environment_id = input.environmentId;
    message.batch_id = input.batchId;
    message.kind = input.kind;
    message.schema_name = input.schemaName;
    message.client_id = input.clientId;
    message.payload = input.payload;
    message.status = 'queued';
    message.enqueued_at = new Date().toISOString();
    message.setPathParams({ organization_id: input.organizationId, project_id: input.projectId });
    await message.save();
    return message;
  }
}

export const defaultPipelineTransport: PipelineTransport = new FirestoreOutboxTransport();
