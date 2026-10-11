import { buildInstallationReport, type ApiKeyKind, type InstallationReport } from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import { EnvironmentModel } from '../models/environment.model';
import { collectSetupObservations } from './setup-health.service';
import type { ApiKeyAuthContext } from './key.service';

/**
 * The installation check (`GET /v1/ingest/verify`, the SDKs' `verify()`, the Installation page and
 * the check_installation MCP tool): which project and environment, and - from real records only,
 * never a manual flag or synthetic data - how each expected schema is doing there.
 */
export interface EnvironmentInstallationCheck {
  project: { id: string; name: string };
  environment: { id: string; name: string };
  report: InstallationReport;
}

export interface InstallationVerification extends EnvironmentInstallationCheck {
  key: { kind: ApiKeyKind; prefix: string; scopes: readonly string[]; allowedOrigins: readonly string[] };
}

/**
 * The schemas a publishable key is checked against when it names none: the visit attribution every
 * browser install sends. A publishable key is public, so it only ever sees the schemas it asks for -
 * never the project's full list.
 */
export const DEFAULT_PUBLISHABLE_EXPECTATIONS = ['touchpoint'] as const;

/** The check for one environment of a project: `expected` schema names, or every schema registered or sent there. */
export async function verifyInstallationForEnvironment(params: { organizationId: string; projectId: string; environmentId: string; expected?: readonly string[]; now?: Date }): Promise<EnvironmentInstallationCheck> {
  const [project, environment, observations] = await Promise.all([
    ProjectModel.init(params.projectId, { organization_id: params.organizationId }),
    EnvironmentModel.init(params.environmentId, { organization_id: params.organizationId, project_id: params.projectId }),
    collectSetupObservations({ organizationId: params.organizationId, projectId: params.projectId, environmentId: params.environmentId }),
  ]);
  return {
    project: { id: params.projectId, name: project?.name ?? '' },
    environment: { id: params.environmentId, name: environment?.name ?? '' },
    report: buildInstallationReport(observations.observations, params.expected ?? [], params.now),
  };
}

export async function verifyInstallationForKey(auth: ApiKeyAuthContext, expected: readonly string[] = [], now: Date = new Date()): Promise<InstallationVerification> {
  const names = expected.length ? expected : auth.kind === 'publishable' ? DEFAULT_PUBLISHABLE_EXPECTATIONS : [];
  const check = await verifyInstallationForEnvironment({ organizationId: auth.organizationId, projectId: auth.projectId, environmentId: auth.environmentId, expected: names, now });
  return { key: { kind: auth.kind, prefix: auth.apiKey.key_prefix, scopes: auth.scopes, allowedOrigins: auth.allowedOrigins }, ...check };
}
