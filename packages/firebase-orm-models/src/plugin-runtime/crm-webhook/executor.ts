import { SinkPluginExecutionError, type SinkPluginExecutor, type SinkPluginPushParams, type SinkPluginPushResult } from '../executor';
import type { CrmWebhookApiClient } from './api-client';
import { CrmWebhookApiError } from './api-client';

export interface CrmWebhookSinkPluginExecutorOptions {
  apiClient: CrmWebhookApiClient;
  webhookUrl: string;
  bearerToken: string;
}

/**
 * The real CRM-sync (webhook) sink-plugin executor (KAN-81, plan `14 §Gap 5`:
 * "export/sync to CRM ... action plugin"). Unlike a source executor (which
 * resolves its own credential lazily inside `sync()`, see
 * `StripeSourcePluginExecutor`), this one is constructed with the already-
 * resolved webhook URL and bearer token — mirroring `StripeSourcePluginExecutor`'s
 * own constructor-injected-`apiClient` shape, just with the destination
 * details alongside it since a sink has nowhere else to carry "where do
 * these records go" (a source's destination is always this project's own
 * ingest pipeline; a sink's destination is external and connector-specific).
 */
export class CrmWebhookSinkPluginExecutor implements SinkPluginExecutor {
  private readonly apiClient: CrmWebhookApiClient;
  private readonly webhookUrl: string;
  private readonly bearerToken: string;

  constructor(options: CrmWebhookSinkPluginExecutorOptions) {
    this.apiClient = options.apiClient;
    this.webhookUrl = options.webhookUrl;
    this.bearerToken = options.bearerToken;
  }

  async push(params: SinkPluginPushParams): Promise<SinkPluginPushResult> {
    try {
      await this.apiClient.pushRecords({ webhookUrl: this.webhookUrl, bearerToken: this.bearerToken, records: params.records });
      return { pushed: params.records.length };
    } catch (error) {
      if (error instanceof CrmWebhookApiError) {
        throw new SinkPluginExecutionError(error.message);
      }
      throw error;
    }
  }
}
