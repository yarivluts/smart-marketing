import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { PluginScope } from '@growthos/shared';

/**
 * `installed`: active, the plugin runs (once KAN-47 builds a real runtime).
 * `disabled`: paused without losing config/consent — re-enabling doesn't
 * need a fresh scope-consent screen. `uninstalled`: terminal; kept (never
 * deleted) as an audit trail of past installs, the same "detached, not
 * deleted" posture `ResourceAttachmentModel` already established. A fresh
 * `installPlugin` call after an uninstall creates a brand-new document
 * rather than reviving this one, so an admin re-installing sees a clean
 * scope-consent screen against whatever the current manifest version is.
 */
export const PLUGIN_INSTALL_STATUSES = ['installed', 'disabled', 'uninstalled'] as const;
export type PluginInstallStatus = (typeof PLUGIN_INSTALL_STATUSES)[number];

/**
 * One project's install of one plugin (KAN-46, plan `08 §4`: "installable
 * per project by a project admin"). Pins the exact manifest `version`
 * installed — a plugin's registry evolving to a newer version never
 * silently changes what an already-installed project runs; upgrading is a
 * deliberate future action (uninstall + reinstall the newer version today,
 * pending a dedicated "upgrade" flow if a later story needs one).
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/plugin_installs',
  path_id: 'plugin_install_id',
})
export class PluginInstallModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public plugin_id!: string;

  @Field({ is_required: true })
  public version!: string;

  @Field({ is_required: true })
  public status!: PluginInstallStatus;

  /** The manifest's own `scopes` at install time, explicitly consented to — plan `12 §5`'s "user-approved at install" scope-consent screen. */
  @Field({ is_required: true })
  public granted_scopes!: PluginScope[];

  /** Values for the manifest's `config_schema`, keyed by field name. */
  @Field({ is_required: true })
  public config!: Record<string, unknown>;

  @Field({ is_required: true })
  public installed_by!: string;

  @Field({ is_required: true })
  public installed_at!: string;

  @Field()
  public disabled_at?: string;

  @Field()
  public enabled_at?: string;

  @Field()
  public uninstalled_at?: string;

  /**
   * The source-plugin runtime's (KAN-47) persisted sync cursor — `undefined`
   * until this install's first sync attempt has ever completed. Kept on the
   * install itself (one cursor per install, mutated in place across its own
   * lifecycle) rather than a separate collection: a cursor is inherently
   * this install's own current position, the same "the record is the
   * result" posture the install's own status fields already use, and it's
   * exactly what must "survive restart" (plan `13 §E7.2`'s AC) — reading it
   * back is just reading this same document again.
   */
  @Field()
  public source_cursor?: string;

  @Field()
  public source_last_synced_at?: string;
}
