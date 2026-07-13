import { isValidSegmentFilterCondition, type SegmentFilterCondition } from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import { SegmentModel } from '../models/segment.model';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';
import { getActiveSchemaDefinition } from './schema-registry.service';

export class InvalidSegmentError extends Error {
  constructor(public readonly reasons: readonly string[]) {
    super(`Invalid segment: ${reasons.join('; ')}`);
    this.name = 'InvalidSegmentError';
  }
}

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

export interface CreateSegmentParams {
  organizationId: string;
  projectId: string;
  name: string;
  schemaName: string;
  filters: readonly unknown[];
  createdByUserId: string;
}

/**
 * Creates a segment (KAN-76, E22.2): validates the name, that `schemaName`
 * is a registered+active `entity`-kind schema in this project, and every
 * filter condition's shape — collecting every problem before throwing,
 * mirroring `createGoal`'s own "collect all reasons, don't fail fast"
 * convention.
 */
export async function createSegment(params: CreateSegmentParams): Promise<SegmentModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);

  const reasons: string[] = [];

  const name = params.name.trim();
  if (name.length === 0) {
    reasons.push('A segment must have a non-empty name.');
  }

  if (params.filters.length === 0) {
    reasons.push('A segment requires at least one filter condition.');
  }
  const validFilters: SegmentFilterCondition[] = [];
  params.filters.forEach((filter, index) => {
    if (isValidSegmentFilterCondition(filter)) {
      validFilters.push(filter);
    } else {
      reasons.push(`Filter at index ${index} is invalid — expected { field: string, op: one of ${['=', '!=', '>', '>=', '<', '<=', 'contains'].join(', ')}, value: string|number|boolean }.`);
    }
  });

  const schemaDef = await getActiveSchemaDefinition(params.organizationId, params.projectId, 'entity', params.schemaName);
  if (!schemaDef) {
    reasons.push(`Entity schema "${params.schemaName}" is not registered (or not active) in this project.`);
  }

  if (reasons.length > 0) {
    throw new InvalidSegmentError(reasons);
  }

  const now = new Date().toISOString();
  const segment = new SegmentModel();
  segment.organization_id = params.organizationId;
  segment.project_id = params.projectId;
  segment.name = name;
  segment.schema_name = params.schemaName;
  segment.filters = validFilters;
  segment.created_by = params.createdByUserId;
  segment.created_at = now;
  segment.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await segment.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.createdByUserId,
      action: 'segment.create',
      targetType: 'segment',
      targetId: segment.id,
      summary: `Created segment "${segment.name}"`,
      after: { schemaName: segment.schema_name, filters: segment.filters },
    });
  } catch {
    // Best-effort — audit logging must never turn a successful create into a failure for the caller.
  }

  return segment;
}

/** Every segment in a project, newest-first — a saved definition has no inherent ordering the way a goal's deadline does. */
export async function listSegmentsForProject(organizationId: string, projectId: string): Promise<SegmentModel[]> {
  await requireProjectInOrg(organizationId, projectId);
  const segments = await SegmentModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('project_id', '==', projectId)
    .get();
  return segments.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
