import type { SchemaFieldInput } from '../../services/schema-registry.service';
import { DuplicateSchemaDefinitionError, registerSchemaDefinition } from '../../services/schema-registry.service';

/**
 * Measure schema name this pack's `ad_spend` metric queries against (see
 * `metrics.ts`'s own doc comment on why `ad_spend` targets this instead of a
 * `fact_ad_spend` dbt table that doesn't exist). Registering a `measure`
 * schema by this name auto-provisions a warehouse mart view
 * (`schema-mart.ts`'s `MART_KINDS`) that `mapCustomSchemaTables`
 * (`metrics-compiler.service.ts`) transparently rewrites `ad_spend`'s
 * `table: 'ad_spend'` to at query-compile time — the same mechanism the
 * landing-page pack's `fact_landing_page_performance` metric would use if it
 * weren't backed by a real dbt model instead.
 */
export const AD_SPEND_MEASURE_NAME = 'ad_spend';

/**
 * `channel_id`/`campaign_id`/`adset_id`/`ad_id` mirror `ad_spend`'s own
 * declared dimensions in `metrics.ts` — every dimension the metric can break
 * down by must be a real field on this schema. No field for the spend amount
 * or event time: a measure schema's envelope-level `value`/`ts` are reserved
 * intrinsic mart columns (`schema-registry.service.ts`'s `validateFields`,
 * `docs/api/ingest.md` §3.3) that `ad_spend`'s `column: 'value'`/
 * `timeColumn: 'ts'` already target directly.
 */
const AD_SPEND_FIELDS: SchemaFieldInput[] = [
  { name: 'channel_id', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'campaign_id', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'adset_id', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'ad_id', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
];

/**
 * Idempotently registers the `ad_spend` measure schema this pack's own
 * `ad_spend` metric depends on (see {@link AD_SPEND_MEASURE_NAME}'s own doc
 * comment), so a project installing the SaaS/marketing metric pack doesn't
 * need an admin to hand-register a matching schema before `POST
 * /v1/ingest/measures` can land any ad-spend data. Mirrors
 * `ensureStripeCommerceSchemasRegistered`'s exact posture: safe to call on
 * every install/re-run, `DuplicateSchemaDefinitionError` just means a prior
 * call (or a human, via the Schema Registry admin page) already registered
 * it — silently skipped, not an error. A human is free to
 * `evolveSchemaDefinition` this family afterward; this function never
 * re-registers or overwrites an existing version.
 */
export async function ensureSaasMetricPackSchemasRegistered(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
): Promise<void> {
  try {
    await registerSchemaDefinition({
      organizationId,
      projectId,
      kind: 'measure',
      name: AD_SPEND_MEASURE_NAME,
      fields: AD_SPEND_FIELDS,
      createdByUserId,
    });
  } catch (error) {
    if (error instanceof DuplicateSchemaDefinitionError) {
      return;
    }
    throw error;
  }
}
