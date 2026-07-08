'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PluginManifestView } from '@/lib/orgs/plugin-view';

export interface InstallPluginFormProps {
  orgId: string;
  projectId: string;
  /** Every registered manifest version in the org, available to install into this project. */
  manifests: readonly PluginManifestView[];
}

function manifestKey(manifest: Pick<PluginManifestView, 'pluginId' | 'version'>): string {
  return `${manifest.pluginId}@${manifest.version}`;
}

/**
 * Installs a registered manifest version into this project (KAN-46 AC:
 * "install-per-project flow (scope consent screen)"). The consent checkbox
 * covers the manifest's *entire* declared scope list — `installPlugin`
 * requires an exact match, so there's no partial-grant UI to build here.
 * Config fields render as a plain text/number input per `config_schema`
 * entry (a boolean field expects the literal text "true"/"false") — a
 * minimal, buildable-today form; richer per-type widgets (a real checkbox,
 * select, etc.) are KAN-48's "config forms rendered from config_schema"
 * scope, not this story's.
 */
export function InstallPluginForm({ orgId, projectId, manifests }: InstallPluginFormProps): React.ReactElement {
  const t = useTranslations('ProjectPlugins');
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState(manifests[0] ? manifestKey(manifests[0]) : '');
  const [consented, setConsented] = useState(false);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => manifests.find((manifest) => manifestKey(manifest) === selectedKey), [manifests, selectedKey]);

  function selectManifest(key: string): void {
    setSelectedKey(key);
    setConsented(false);
    setConfig({});
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

    const parsedConfig: Record<string, unknown> = {};
    for (const [name, field] of Object.entries(selected.configSchema)) {
      const raw = config[name];
      if (raw === undefined || raw === '') {
        continue;
      }
      parsedConfig[name] = field.type === 'number' ? Number(raw) : field.type === 'boolean' ? raw === 'true' : raw;
    }

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
      setConsented(false);
      setConfig({});
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (manifests.length === 0) {
    return <p className="text-muted-foreground">{t('noManifestsToInstall')}</p>;
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="install-plugin-select">
          {t('selectPluginLabel')}
        </label>
        <select
          id="install-plugin-select"
          className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
          value={selectedKey}
          onChange={(event) => selectManifest(event.target.value)}
        >
          {manifests.map((manifest) => (
            <option key={manifestKey(manifest)} value={manifestKey(manifest)}>
              {t('pluginOptionLabel', { displayName: manifest.displayName, version: manifest.version })}
            </option>
          ))}
        </select>
      </div>

      {selected ? (
        <>
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
                  <label className="text-sm font-medium" htmlFor={`install-plugin-config-${name}`}>
                    {name}
                    {field.required ? ' *' : ''}
                  </label>
                  <Input
                    id={`install-plugin-config-${name}`}
                    type={field.type === 'number' ? 'number' : 'text'}
                    required={field.required}
                    value={config[name] ?? ''}
                    onChange={(event) => setConfig((prev) => ({ ...prev, [name]: event.target.value }))}
                  />
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting || !selected}>
        {t('installButton')}
      </Button>
    </form>
  );
}
