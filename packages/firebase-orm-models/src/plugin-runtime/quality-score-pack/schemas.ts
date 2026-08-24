import { ONBOARDING_SURVEY_SCHEMA_FIELDS, ONBOARDING_SURVEY_SCHEMA_KIND, ONBOARDING_SURVEY_SCHEMA_NAME } from '@growthos/shared';
import { DuplicateSchemaDefinitionError, registerSchemaDefinition } from '../../services/schema-registry.service';

/**
 * Idempotently registers the KAN-83 `onboarding_survey` event schema (v1)
 * for a project, if it isn't already registered — the same "seed on demand"
 * posture `ensureSurveyResponseSchemaRegistered` (KAN-82) and
 * `ensureCancellationReasonSchemaRegistered` (KAN-84) established. Without
 * this, every onboarding-survey answer a signup flow sends would quarantine
 * with `schema_not_registered`.
 */
export async function ensureOnboardingSurveySchemaRegistered(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
): Promise<void> {
  try {
    await registerSchemaDefinition({
      organizationId,
      projectId,
      kind: ONBOARDING_SURVEY_SCHEMA_KIND,
      name: ONBOARDING_SURVEY_SCHEMA_NAME,
      fields: ONBOARDING_SURVEY_SCHEMA_FIELDS.map((field) => ({
        name: field.name,
        type: field.type,
        isRequired: field.isRequired,
        isPii: field.isPii,
        isIdentityKey: field.isIdentityKey,
      })),
      createdByUserId,
    });
  } catch (error) {
    if (error instanceof DuplicateSchemaDefinitionError) {
      return;
    }
    throw error;
  }
}
