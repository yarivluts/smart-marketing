import { deriveSetupHealth, type SetupEnvironmentRef, type SetupHealthReport, type SetupSchemaObservation } from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import type { SchemaDefKind } from '../models/schema-def.model';
import { listEnvironmentsForProject } from './organization.service';
import { getMostRecentRawRecordForSchema } from './pipeline.service';
import { listQuarantinedRecordsForProject } from './quarantine.service';
import { ProjectNotFoundError } from './resource-library.service';
import { listSchemaDefinitionsForProject } from './schema-registry.service';

/**
 * How many of an environment's open quarantined records the setup-health read looks at - the same
 * bound the ingest-health quarantine browser uses. A requirement whose only rejected records are
 * older than this window reads as a gap rather than an error, which understates the problem but
 * never invents a connection.
 */
export const SETUP_HEALTH_QUARANTINE_SAMPLE_LIMIT = 200;

export interface CollectSetupObservationsParams {
  organizationId: string;
  projectId: string;
  /** Restrict to one environment (an `EnvironmentModel` id). Omitted: every environment of the project. */
  environmentId?: string;
}

export interface SetupObservations {
  environments: SetupEnvironmentRef[];
  observations: SetupSchemaObservation[];
}

function schemaKey(kind: SchemaDefKind, name: string): string {
  return `${kind}:${name}`;
}

/**
 * What each environment has actually received, per schema (KAN-197): for every schema registered
 * in the project, the most recent accepted record that landed in that environment, plus every
 * schema - registered or not - with records still open in that environment's quarantine.
 *
 * Registered schemas are the complete list of names an accepted record can carry: ingest
 * quarantines any record whose schema is not registered (`schema_not_registered`), and schemas
 * are never deleted. Each lookup is `getMostRecentRawRecordForSchema`'s single-document read on
 * the existing (`environment_id`, `kind`, `schema_name`, `landed_at`) index, and the quarantine
 * read uses the existing (`environment_id`, `status`, `created_at`) one, so this needs no new index.
 */
export async function collectSetupObservations(params: CollectSetupObservationsParams): Promise<SetupObservations> {
  const project = await ProjectModel.init(params.projectId, { organization_id: params.organizationId });
  if (!project || project.organization_id !== params.organizationId) {
    throw new ProjectNotFoundError();
  }

  const [allEnvironments, schemaDefs] = await Promise.all([
    listEnvironmentsForProject(params.organizationId, params.projectId),
    listSchemaDefinitionsForProject(params.organizationId, params.projectId),
  ]);
  const environments = allEnvironments
    .filter((environment) => params.environmentId === undefined || environment.id === params.environmentId)
    .map((environment) => ({ id: environment.id, name: environment.name }));

  const registered = new Map<string, { kind: SchemaDefKind; name: string }>();
  for (const def of schemaDefs) {
    registered.set(schemaKey(def.kind, def.name), { kind: def.kind, name: def.name });
  }

  const perEnvironment = await Promise.all(
    environments.map(async (environment) => {
      const [latestAccepted, quarantined] = await Promise.all([
        Promise.all(
          [...registered.values()].map(async (schema) => {
            const record = await getMostRecentRawRecordForSchema(params.organizationId, params.projectId, environment.id, schema.kind, schema.name);
            return [schemaKey(schema.kind, schema.name), record?.landed_at ?? null] as const;
          }),
        ),
        listQuarantinedRecordsForProject(params.organizationId, params.projectId, SETUP_HEALTH_QUARANTINE_SAMPLE_LIMIT, environment.id),
      ]);

      const observations = new Map<string, SetupSchemaObservation>();
      const observe = (kind: SchemaDefKind, schemaName: string): SetupSchemaObservation => {
        const key = schemaKey(kind, schemaName);
        const existing = observations.get(key);
        if (existing) return existing;
        const created: SetupSchemaObservation = {
          environmentId: environment.id,
          kind,
          schemaName,
          registered: registered.has(key),
          lastAcceptedAt: null,
          openQuarantinedCount: 0,
          quarantineReasons: [],
        };
        observations.set(key, created);
        return created;
      };

      for (const schema of registered.values()) {
        observe(schema.kind, schema.name);
      }
      for (const [key, landedAt] of latestAccepted) {
        const observation = observations.get(key);
        if (observation) observation.lastAcceptedAt = landedAt;
      }
      for (const record of quarantined) {
        const observation = observe(record.kind, record.schema_name);
        observation.openQuarantinedCount += 1;
        observation.quarantineReasons = [...new Set([...observation.quarantineReasons, ...(record.reasons ?? [])])];
      }
      return [...observations.values()];
    }),
  );

  return { environments, observations: perEnvironment.flat() };
}

/** Each setup requirement's status in each environment of the project, derived only from observed ingest records. */
export async function evaluateProjectSetupHealth(params: CollectSetupObservationsParams): Promise<SetupHealthReport> {
  const { environments, observations } = await collectSetupObservations(params);
  return deriveSetupHealth(environments, observations);
}
