export class CrmWebhookApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'CrmWebhookApiError';
  }
}

export interface CrmWebhookPushParams {
  webhookUrl: string;
  bearerToken: string;
  records: readonly Record<string, unknown>[];
}

/**
 * The one outbound call this connector needs, kept as a small interface (not
 * a real CRM SDK, since no specific CRM is targeted — see `manifest.ts`'s
 * own doc comment) so `CrmWebhookSinkPluginExecutor` can be driven by a fake
 * client in tests without any network access — the exact mirror of
 * `StripeApiClient`'s own "buildable-today, swap the provider later" seam,
 * applied outbound.
 */
export interface CrmWebhookApiClient {
  pushRecords(params: CrmWebhookPushParams): Promise<void>;
}

/**
 * The real CRM webhook client — a plain authenticated `fetch` POST of the
 * whole batch as one JSON array, no SDK dependency. This is the
 * implementation `CrmWebhookSinkPluginExecutor` uses by default in
 * production; every automated test in this repo drives the executor with a
 * fake {@link CrmWebhookApiClient} instead, the same posture
 * `StripeHttpApiClient`'s own doc comment documents for its own real client.
 */
export class CrmWebhookHttpApiClient implements CrmWebhookApiClient {
  async pushRecords(params: CrmWebhookPushParams): Promise<void> {
    const response = await fetch(params.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.bearerToken}`,
      },
      body: JSON.stringify({ records: params.records }),
    });
    if (!response.ok) {
      throw new CrmWebhookApiError(`CRM webhook request failed with status ${response.status}`, response.status);
    }
  }
}
