import 'server-only';
import { assertAdStudioQuota, recordAdStudioUsage, type AdStudioUsageKind } from '@growthos/firebase-orm-models';
import { AdStudioProviderError, type AdStudioLlm } from './llm';

/** Who is making a model call, for which project, with which model. */
export interface AdStudioCallContext {
  organizationId: string;
  projectId: string;
  actorId: string;
  llm: AdStudioLlm;
  now?: Date;
}

/**
 * Runs one model call inside the project's daily limit and logs it either way. The limit is checked
 * before the call so a refused call costs nothing; the usage row is written after it, succeeded or
 * failed, since a failed provider call can still be billed. Shared by planning, scripts and scene
 * rewrites so every text call counts toward the same limit the same way.
 */
export async function meteredCall<T>(ctx: AdStudioCallContext, kind: AdStudioUsageKind, briefId: string, run: () => Promise<T>): Promise<T> {
  await assertAdStudioQuota({ organizationId: ctx.organizationId, projectId: ctx.projectId, kind, units: 1, now: ctx.now });
  const base = {
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    kind,
    provider: ctx.llm.provider,
    model: ctx.llm.model,
    units: 1,
    briefId,
    actorId: ctx.actorId,
    now: ctx.now,
  };
  try {
    const result = await run();
    await recordAdStudioUsage({ ...base, outcome: 'succeeded' });
    return result;
  } catch (error) {
    const reason = error instanceof AdStudioProviderError ? error.code : 'provider_error';
    await recordAdStudioUsage({ ...base, outcome: 'failed', failureReason: reason });
    throw error;
  }
}
