import { TOUCHPOINT_SCHEMA_FIELDS, TOUCHPOINT_SCHEMA_KIND, TOUCHPOINT_SCHEMA_NAME } from '@growthos/shared';
import { DuplicateSchemaDefinitionError, getActiveSchemaDefinition, registerSchemaDefinition } from './schema-registry.service';
import type { SchemaDefModel } from '../models/schema-def.model';

export interface EnsureTouchpointSchemaRegisteredParams {
  organizationId: string;
  projectId: string;
  createdByUserId: string;
}

export interface EnsureTouchpointSchemaRegisteredResult {
  schemaDef: SchemaDefModel;
  /** `false` when an active `touchpoint` schema already existed and this call was a no-op — lets the admin action report "already set up" instead of implying it just registered a fresh v1. */
  registered: boolean;
}

/**
 * Idempotently registers the KAN-57 touchpoint-capture event schema (v1) for
 * a project, if it isn't already registered — the same "seed on demand"
 * posture the Stripe source plugin (KAN-49) uses for its own commerce
 * schemas, applied here to a one-click admin action instead of a scheduled
 * "Run now" trigger. Without this, every touchpoint event the tracker (or
 * embed snippet) sends would quarantine with `schema_not_registered` until a
 * human hand-built the exact field list via the Schema Registry's generic
 * register form.
 */
export async function ensureTouchpointSchemaRegistered(
  params: EnsureTouchpointSchemaRegisteredParams,
): Promise<EnsureTouchpointSchemaRegisteredResult> {
  const existing = await getActiveSchemaDefinition(
    params.organizationId,
    params.projectId,
    TOUCHPOINT_SCHEMA_KIND,
    TOUCHPOINT_SCHEMA_NAME,
  );
  if (existing) {
    return { schemaDef: existing, registered: false };
  }

  try {
    const schemaDef = await registerSchemaDefinition({
      organizationId: params.organizationId,
      projectId: params.projectId,
      kind: TOUCHPOINT_SCHEMA_KIND,
      name: TOUCHPOINT_SCHEMA_NAME,
      fields: TOUCHPOINT_SCHEMA_FIELDS.map((field) => ({
        name: field.name,
        type: field.type,
        isRequired: field.isRequired,
        isPii: field.isPii,
        isIdentityKey: field.isIdentityKey,
      })),
      createdByUserId: params.createdByUserId,
    });
    return { schemaDef, registered: true };
  } catch (err) {
    // `registerSchemaDefinition` isn't transactional (see its own doc
    // comment) — a concurrent caller can win the race between our existence
    // check above and this call. Treat that the same as having found it
    // already registered, rather than surfacing a confusing duplicate error
    // from what the caller only ever sees as an idempotent "make sure this is
    // set up" action.
    if (err instanceof DuplicateSchemaDefinitionError) {
      const nowActive = await getActiveSchemaDefinition(
        params.organizationId,
        params.projectId,
        TOUCHPOINT_SCHEMA_KIND,
        TOUCHPOINT_SCHEMA_NAME,
      );
      if (nowActive) {
        return { schemaDef: nowActive, registered: false };
      }
    }
    throw err;
  }
}
