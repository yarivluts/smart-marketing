import { randomBytes } from 'node:crypto';
import type { PluginScope } from '@growthos/shared';
import type { PluginInstallModel } from '../models/plugin-install.model';

/** How long a minted runtime credential is valid for before a fresh one must be minted for the next run. */
export const DEFAULT_RUNTIME_CREDENTIAL_TTL_MS = 15 * 60_000;

/**
 * A scoped, short-lived credential handed to a source-plugin executor for
 * one run (plan `13 §E7.2`/`08 §4`'s "scoped, short-lived credentials — a
 * plugin only sees its own project's data and only the scopes it declared").
 * `token` is an opaque, per-run random value — today's toy executor never
 * actually uses it to authenticate anywhere, but the shape exists so a real
 * executor (once a sandboxed container/V8-isolate runtime exists, per plan
 * `08 §4`'s "Runtime" bullet) has somewhere to plug in a real workload-
 * identity-scoped token without `SourcePluginExecutor`'s own interface
 * changing.
 */
export interface PluginRuntimeCredential {
  token: string;
  /** ISO timestamp; the credential is only meaningful up to this instant. */
  expiresAt: string;
  organizationId: string;
  projectId: string;
  pluginInstallId: string;
  scopes: readonly PluginScope[];
}

/**
 * Mints a fresh, per-run credential scoped to exactly one install's own
 * granted scopes — never persisted, never reused across runs. Stands in for
 * a real sandboxed-runtime credential issuer (e.g. a short-lived GCP
 * workload-identity token minted per Cloud Run job invocation) until KAN-18
 * provisions somewhere to run a real isolated plugin workload, the same
 * "buildable today, swap the provider later" split `LocalKmsProvider`
 * (KAN-29) already established for its own credential-adjacent seam.
 */
export function mintPluginRuntimeCredential(
  install: PluginInstallModel,
  ttlMs: number = DEFAULT_RUNTIME_CREDENTIAL_TTL_MS,
): PluginRuntimeCredential {
  return {
    token: randomBytes(24).toString('base64url'),
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    organizationId: install.organization_id,
    projectId: install.project_id,
    pluginInstallId: install.id,
    scopes: [...install.granted_scopes],
  };
}
