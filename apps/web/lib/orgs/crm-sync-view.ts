import type { MetaLookalikeAudienceModel, PluginInstallModel, PluginSinkRunModel, PluginSinkRunStatus } from '@growthos/firebase-orm-models';

/** One action-type plugin install, as offered by the Segments page's "Sync to CRM" picker — never the full `@arbel/firebase-orm` model instance. */
export interface ActionPluginInstallOptionView {
  id: string;
  pluginId: string;
}

export function toActionPluginInstallOptionView(install: PluginInstallModel): ActionPluginInstallOptionView {
  return { id: install.id, pluginId: install.plugin_id };
}

/** One segment's CRM-sync run, as shown on the Segments page — mirrors `PluginSourceRunView`'s exact shape/naming for the outbound direction. */
export interface CrmSyncRunView {
  id: string;
  status: PluginSinkRunStatus;
  startedAt: string;
  finishedAt: string | null;
  attempts: number | null;
  recordsAttempted: number;
  recordsPushed: number | null;
  /** Present only for a `failed` run. */
  errorMessage: string | null;
}

export function toCrmSyncRunView(run: PluginSinkRunModel): CrmSyncRunView {
  return {
    id: run.id,
    status: run.status,
    startedAt: run.started_at,
    finishedAt: run.finished_at ?? null,
    attempts: run.attempts ?? null,
    recordsAttempted: run.records_attempted,
    recordsPushed: run.records_pushed ?? null,
    errorMessage: run.error_message ?? null,
  };
}

/** One Meta Lookalike Audience created from a Meta Custom Audience install's own seed audience (KAN-73 follow-up), as shown on the project Plugins page. */
export interface MetaLookalikeAudienceView {
  id: string;
  audienceId: string;
  name: string;
  originAudienceId: string;
  country: string;
  ratio: number;
  createdAt: string;
}

export function toMetaLookalikeAudienceView(audience: MetaLookalikeAudienceModel): MetaLookalikeAudienceView {
  return {
    id: audience.id,
    audienceId: audience.audience_id,
    name: audience.name,
    originAudienceId: audience.origin_audience_id,
    country: audience.country,
    ratio: audience.ratio,
    createdAt: audience.created_at,
  };
}
