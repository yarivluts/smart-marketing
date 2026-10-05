import { buildInstallationReport, type ApiKeyKind, type InstallationReport } from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import { EnvironmentModel } from '../models/environment.model';
import { collectSetupObservations } from './setup-health.service';
import type { ApiKeyAuthContext } from './key.service';

/**
 * What a key's holder sees when checking an installation (`GET /v1/ingest/verify`, the SDKs'
 * `verify()`): which project and environment the key writes to, and - from real records only - how
 * each expected schema is doing there.
 */
export interface InstallationVerification {
  key: { kind: ApiKeyKind; prefix: string; scopes: readonly string[]; allowedOrigins: readonly string[] };
  project: { id: string; name: string };
  environment: { id: string; name: string };
  report: InstallationReport;
}

/**
 * The schemas a publishable key is checked against when it names none: the visit attribution every
 * browser install sends. A publishable key is public, so it only ever sees the schemas it asks for -
 * never the project's full list.
 */
export const DEFAULT_PUBLISHABLE_EXPECTATIONS = ['touchpoint'] as const;

export async function verifyInstallationForKey(auth: ApiKeyAuthContext, expected: readonly string[] = [], now: Date = new Date()): Promise<InstallationVerification> {
  const [project, environment, observations] = await Promise.all([
    ProjectModel.init(auth.projectId, { organization_id: auth.organizationId }),
    EnvironmentModel.init(auth.environmentId, { organization_id: auth.organizationId, project_id: auth.projectId }),
    collectSetupObservations({ organizationId: auth.organizationId, projectId: auth.projectId, environmentId: auth.environmentId }),
  ]);
  const names = expected.length ? expected : auth.kind === 'publishable' ? DEFAULT_PUBLISHABLE_EXPECTATIONS : [];
  return {
    key: { kind: auth.kind, prefix: auth.apiKey.key_prefix, scopes: auth.scopes, allowedOrigins: auth.allowedOrigins },
    project: { id: auth.projectId, name: project?.name ?? '' },
    environment: { id: auth.environmentId, name: environment?.name ?? '' },
    report: buildInstallationReport(observations.observations, names, now),
  };
}
