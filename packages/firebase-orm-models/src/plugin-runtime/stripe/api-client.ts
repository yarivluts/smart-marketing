import type { StripeCharge, StripeInvoice, StripeListPage, StripeRefund, StripeSubscription } from './types';

export interface StripeListParams {
  /** Stripe's own cursor-pagination param — fetch the page after this object id. `undefined` starts from the beginning. */
  startingAfter?: string;
  /** Unix-seconds lower bound on `created`, inclusive — used once backfill has caught up, to only fetch what's new. */
  createdGte?: number;
  limit: number;
}

export class StripeApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'StripeApiError';
  }
}

/**
 * The Stripe REST calls this connector needs, kept as a small interface
 * (not the `stripe` npm SDK) so a run's own executor can be driven by a
 * fake client in tests without any network access — the same
 * "buildable-today, swap the provider later" seam
 * `WarehouseQueryExecutor`/`KmsProvider` already established for their own
 * external-system boundaries.
 */
export interface StripeApiClient {
  listCharges(params: StripeListParams): Promise<StripeListPage<StripeCharge>>;
  listInvoices(params: StripeListParams): Promise<StripeListPage<StripeInvoice>>;
  listRefunds(params: StripeListParams): Promise<StripeListPage<StripeRefund>>;
  listSubscriptions(params: StripeListParams): Promise<StripeListPage<StripeSubscription>>;
}

const STRIPE_API_BASE_URL = 'https://api.stripe.com/v1';

function buildQuery(params: StripeListParams, extra?: Record<string, string>): string {
  const query = new URLSearchParams({ limit: String(params.limit) });
  if (params.startingAfter) {
    query.set('starting_after', params.startingAfter);
  }
  if (params.createdGte !== undefined) {
    query.set('created[gte]', String(params.createdGte));
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      query.set(key, value);
    }
  }
  return query.toString();
}

/**
 * The real Stripe API client — plain `fetch` against Stripe's documented
 * REST endpoints with basic-auth-style bearer secret-key auth, no SDK
 * dependency. This is the implementation `StripeSourcePluginExecutor` uses
 * by default in production; every automated test in this repo drives the
 * executor with a fake {@link StripeApiClient} instead, since there is no
 * real Stripe test account reachable from CI (KAN-49's AC bar — "MRR
 * matches the Stripe dashboard ±1% on a test account" — is deferred until
 * one exists, the same posture KAN-32/33's load-test halves and
 * KAN-50/51's own "±1% vs. the ads UI" bars already carry).
 */
export class StripeHttpApiClient implements StripeApiClient {
  constructor(private readonly apiSecretKey: string) {}

  private async get<T>(path: string, query: string): Promise<StripeListPage<T>> {
    const response = await fetch(`${STRIPE_API_BASE_URL}${path}?${query}`, {
      headers: { Authorization: `Bearer ${this.apiSecretKey}` },
    });
    if (!response.ok) {
      throw new StripeApiError(`Stripe API request to ${path} failed with status ${response.status}`, response.status);
    }
    return (await response.json()) as StripeListPage<T>;
  }

  listCharges(params: StripeListParams): Promise<StripeListPage<StripeCharge>> {
    return this.get('/charges', buildQuery(params));
  }

  listInvoices(params: StripeListParams): Promise<StripeListPage<StripeInvoice>> {
    return this.get('/invoices', buildQuery(params));
  }

  listRefunds(params: StripeListParams): Promise<StripeListPage<StripeRefund>> {
    return this.get('/refunds', buildQuery(params));
  }

  listSubscriptions(params: StripeListParams): Promise<StripeListPage<StripeSubscription>> {
    return this.get('/subscriptions', buildQuery(params, { status: 'all' }));
  }
}
