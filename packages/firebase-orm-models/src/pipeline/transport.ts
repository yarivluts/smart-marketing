import { PipelineMessageModel } from '../models/pipeline-message.model';
import type { PipelineRecordEnvelope } from './record';

/**
 * Publishes one accepted record to the pipeline (KAN-33, plan `13 §E3.3`). Firestore is the durable
 * outbox standing in for a real Pub/Sub topic per project (plan `08 §generic-platform`) until KAN-18
 * provisions one. A real swap (publish to a GCP Pub/Sub topic, with a push subscription calling
 * `landPipelineMessages`) is a plain function with the same signature — no interface here, since
 * nothing in this codebase substitutes an alternative implementation today (unlike `WarehouseSink`,
 * which tests genuinely do substitute); add one only once a second implementation exists to justify it.
 */
export async function publishPipelineMessage(input: PipelineRecordEnvelope): Promise<PipelineMessageModel> {
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
