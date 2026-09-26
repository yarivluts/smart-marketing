import { SETUP_REQUIREMENTS } from './catalog';
import { classifySchemaForSetupRequirement } from './classify';
import type {
  SetupEnvironmentHealth,
  SetupEnvironmentRef,
  SetupHealthReport,
  SetupRequirementEnvironmentResult,
  SetupRequirementId,
  SetupRequirementStatus,
  SetupSchemaEvidence,
  SetupSchemaObservation,
} from './types';

const CORE_REQUIREMENT_IDS: ReadonlySet<SetupRequirementId> = new Set(
  SETUP_REQUIREMENTS.filter((requirement) => requirement.importance === 'core').map((requirement) => requirement.id),
);

/** dev, staging, prod: the order a person reads them in, whatever order Firestore returned them. */
const ENVIRONMENT_ORDER = ['dev', 'staging', 'prod'];

function environmentRank(name: string): number {
  const index = ENVIRONMENT_ORDER.indexOf(name);
  return index === -1 ? ENVIRONMENT_ORDER.length : index;
}

function toEvidence(observation: SetupSchemaObservation): SetupSchemaEvidence {
  return {
    kind: observation.kind,
    name: observation.schemaName,
    lastAcceptedAt: observation.lastAcceptedAt,
    openQuarantinedCount: observation.openQuarantinedCount,
  };
}

function statusFor(accepted: readonly SetupSchemaEvidence[], rejected: readonly SetupSchemaEvidence[]): SetupRequirementStatus {
  if (accepted.length > 0) return 'connected';
  if (rejected.length > 0) return 'error';
  return 'gap';
}

function deriveRequirementResult(requirementId: SetupRequirementId, observations: readonly SetupSchemaObservation[]): SetupRequirementEnvironmentResult {
  const accepted = observations
    .filter((observation) => observation.lastAcceptedAt !== null)
    .map(toEvidence)
    .sort((a, b) => (b.lastAcceptedAt ?? '').localeCompare(a.lastAcceptedAt ?? '') || a.name.localeCompare(b.name));
  const rejected = observations
    .filter((observation) => observation.openQuarantinedCount > 0)
    .map(toEvidence)
    .sort((a, b) => a.name.localeCompare(b.name));
  const silentRegisteredSchemas = observations
    .filter((observation) => observation.registered && observation.lastAcceptedAt === null)
    .map((observation) => observation.schemaName)
    .sort();
  const quarantineReasons = [...new Set(observations.flatMap((observation) => observation.quarantineReasons))].sort();

  return {
    requirementId,
    status: statusFor(accepted, rejected),
    acceptedSchemas: accepted,
    rejectedSchemas: rejected,
    silentRegisteredSchemas,
    quarantineReasons,
    lastAcceptedAt: accepted[0]?.lastAcceptedAt ?? null,
  };
}

/**
 * Turns per-schema observations into each requirement's status in each environment.
 *
 * Environments are judged independently: records accepted in dev say nothing about prod, the
 * same rule every environment-scoped read in the product follows (KAN-99/KAN-196), so a project
 * that only ever sent test traffic reads as connected in dev and as a gap in prod. An observation
 * for an environment not in `environments` is ignored rather than attributed to another one.
 */
export function deriveSetupHealth(environments: readonly SetupEnvironmentRef[], observations: readonly SetupSchemaObservation[]): SetupHealthReport {
  const sortedEnvironments = [...environments].sort((a, b) => environmentRank(a.name) - environmentRank(b.name) || a.name.localeCompare(b.name));

  const environmentHealth: SetupEnvironmentHealth[] = sortedEnvironments.map((environment) => {
    const inEnvironment = observations.filter((observation) => observation.environmentId === environment.id);
    const requirements = SETUP_REQUIREMENTS.map((requirement) =>
      deriveRequirementResult(
        requirement.id,
        inEnvironment.filter((observation) => classifySchemaForSetupRequirement(observation.kind, observation.schemaName) === requirement.id),
      ),
    );
    const connected = requirements.filter((result) => result.status === 'connected');
    return {
      environmentId: environment.id,
      environmentName: environment.name,
      requirements,
      connectedCount: connected.length,
      totalCount: requirements.length,
      coreConnectedCount: connected.filter((result) => CORE_REQUIREMENT_IDS.has(result.requirementId)).length,
      coreTotalCount: CORE_REQUIREMENT_IDS.size,
      score: requirements.length === 0 ? 0 : Math.round((connected.length / requirements.length) * 100),
    };
  });

  return { environments: environmentHealth };
}
