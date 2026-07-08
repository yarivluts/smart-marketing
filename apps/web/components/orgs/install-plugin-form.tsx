'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { groupManifestsByPluginId, type PluginFamilyView, type PluginManifestView } from '@/lib/orgs/plugin-view';

export interface InstallPluginFormProps {
  orgId: string;
  projectId: string;
  /** Every registered manifest version in the org, available to install into this project. */
  manifests: readonly PluginManifestView[];
}

type ConfigValue = string | boolean;

function newestVersion(family: PluginFamilyView): PluginManifestView {
  return family.versions[family.versions.length - 1];
}

/**
 * Installs a registered manifest into this project (KAN-46 AC: "install-per-
 * project flow (scope consent screen)"; KAN-48 AC: "Non-engineer installs
 * and configures a plugin end-to-end"). A browsable card gallery (grouped by
 * plugin id via `groupManifestsByPluginId`, one card per plugin) replaces
 * picking a raw `pluginId@version` string out of a dropdown — a non-engineer
 * can scan `displayName`/`type`/`scopes`/`registers` before picking. The
 * consent checkbox covers the manifest's *entire* declared scope list —
 * `installPlugin` requires an exact match, so there's no partial-grant UI to
 * build. Config fields render a real typed widget per `config_schema` entry
 * — a checkbox bound to an actual boolean for `boolean` fields (not the
 * literal text "true"/"false" the pre-KAN-48 text input required), typed
 * text/number inputs otherwise — with inline required-field validation
 * feedback instead of a bare `*`.
 */
export function InstallPluginForm({ orgId, projectId, manifests }: InstallPluginFormProps): React.ReactElement {
  const t = useTranslations('ProjectPlugins');
  const router = useRouter();

  const families = useMemo(() => groupManifestsByPluginId(manifests), [manifests]);

  const [selectedPluginId, setSelectedPluginId] = useState(families[0]?.pluginId ?? '');
  const selectedFamily = useMemo(() => families.find((family) => family.pluginId === selectedPluginId), [families, selectedPluginId]);

  const [selectedVersion, setSelectedVersion] = useState(selectedFamily ? newestVersion(selectedFamily).version : '');
  const selected = useMemo(() => {
    if (!selectedFamily) {
      return undefined;
    }
    return selectedFamily.versions.find((version) => version.version === selectedVersion) ?? newestVersion(selectedFamily);
  }, [selectedFamily, selectedVersion]);

  const [consented, setConsented] = useState(false);
  const [config, setConfig] = useState<Record<string, ConfigValue>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetSelection(): void {
    setConsented(false);
    setConfig({});
    setFieldErrors({});
    setError(null);
  }

  function selectPlugin(pluginId: string): void {
    setSelectedPluginId(pluginId);
    const family = families.find((candidate) => candidate.pluginId === pluginId);
    setSelectedVersion(family ? newestVersion(family).version : '');
    resetSelection();
  }

  function selectVersion(version: string): void {
    setSelectedVersion(version);
    resetSelection();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    if (!selected) {
      return;
    }
    if (!consented) {
      setError(t('consentRequiredError'));
      return;
    }

    const nextFieldErrors: Record<string, string> = {};
    const parsedConfig: Record<string, unknown> = {};
    for (const [name, field] of Object.entries(selected.configSchema)) {
      const raw = config[name];
      if (field.type === 'boolean') {
        parsedConfig[name] = raw === true;
        continue;
      }
      if (raw === undefined || raw === '') {
        if (field.required) {
          nextFieldErrors[name] = t('configFieldRequiredError');
        }
        continue;
      }
      parsedConfig[name] = field.type === 'number' ? Number(raw) : raw;
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/plugins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pluginId: selected.pluginId,
          version: selected.version,
          consentedScopes: selected.scopes,
          config: parsedConfig,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string; reasons?: string[] } | null;
        if (body?.error === 'already_installed') {
          setError(t('alreadyInstalledError'));
        } else if (body?.reasons?.length) {
          setError(body.reasons.join(' '));
        } else {
          setError(t('installError'));
        }
        return;
      }
      resetSelection();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (families.length === 0) {
    return <p className="text-muted-foreground">{t('noManifestsToInstall')}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="listbox" aria-label={t('galleryLabel')} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {families.map((family) => {
          const newest = newestVersion(family);
          const isSelected = family.pluginId === selectedPluginId;
          const registersCount = newest.registers.entities.length + newest.registers.events.length + newest.registers.metrics.length;
          return (
            <button
              key={family.pluginId}
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => selectPlugin(family.pluginId)}
              className={`flex flex-col gap-1.5 rounded-md border px-4 py-3 text-start text-sm shadow-sm transition-colors ${
                isSelected ? 'border-primary ring-1 ring-primary' : 'border-input hover:border-primary/50'
              }`}
            >
              <span className="font-medium">{newest.displayName}</span>
              <span className="text-xs text-muted-foreground">{family.pluginId}</span>
              <span className="text-xs text-muted-foreground">{t('galleryTypeLine', { type: newest.type })}</span>
              <span className="text-xs text-muted-foreground">{t('galleryScopesLine', { scopes: newest.scopes.join(', ') })}</span>
              {registersCount > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {t('galleryRegistersLine', {
                    entities: newest.registers.entities.length,
                    events: newest.registers.events.length,
                    metrics: newest.registers.metrics.length,
                  })}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {selected ? (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          {selectedFamily && selectedFamily.versions.length > 1 ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="install-plugin-version">
                {t('selectVersionLabel')}
              </label>
              <select
                id="install-plugin-version"
                className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                value={selectedVersion}
                onChange={(event) => selectVersion(event.target.value)}
              >
                {selectedFamily.versions.map((version) => (
                  <option key={version.version} value={version.version}>
                    {version.version}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5 rounded-md border border-input px-3 py-2">
            <span className="text-sm font-medium">{t('scopesHeading')}</span>
            <ul className="text-sm text-muted-foreground">
              {selected.scopes.map((scope) => (
                <li key={scope}>{scope}</li>
              ))}
            </ul>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} />
              {t('consentCheckboxLabel')}
            </label>
          </div>

          {Object.keys(selected.configSchema).length > 0 ? (
            <div className="flex flex-col gap-3">
              <span className="text-sm font-medium">{t('configHeading')}</span>
              {Object.entries(selected.configSchema).map(([name, field]) => (
                <div key={name} className="flex flex-col gap-1.5">
                  {field.type === 'boolean' ? (
                    <label className="flex items-center gap-2 text-sm font-medium" htmlFor={`install-plugin-config-${name}`}>
                      <input
                        id={`install-plugin-config-${name}`}
                        type="checkbox"
                        checked={config[name] === true}
                        onChange={(event) => setConfig((prev) => ({ ...prev, [name]: event.target.checked }))}
                      />
                      <span>
                        {name}
                        {field.required ? <span className="text-destructive"> {t('configFieldRequiredMarker')}</span> : null}
                      </span>
                    </label>
                  ) : (
                    <>
                      <label className="text-sm font-medium" htmlFor={`install-plugin-config-${name}`}>
                        {name}
                        {field.required ? <span className="text-destructive"> {t('configFieldRequiredMarker')}</span> : null}
                      </label>
                      <Input
                        id={`install-plugin-config-${name}`}
                        type={field.type === 'number' ? 'number' : 'text'}
                        required={field.required}
                        aria-invalid={Boolean(fieldErrors[name])}
                        value={typeof config[name] === 'string' ? (config[name] as string) : ''}
                        onChange={(event) => setConfig((prev) => ({ ...prev, [name]: event.target.value }))}
                      />
                    </>
                  )}
                  {fieldErrors[name] ? (
                    <p role="alert" className="text-xs text-destructive">
                      {fieldErrors[name]}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={submitting}>
            {t('installButton')}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
