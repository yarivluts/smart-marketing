'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { PluginConfigFieldSchema } from '@growthos/firebase-orm-models';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { parsePluginConfigFieldValues, PluginConfigFields, type PluginConfigFieldValue } from '@/components/orgs/plugin-config-fields';

export interface EditPluginInstallConfigFormProps {
  orgId: string;
  projectId: string;
  installId: string;
  configSchema: Record<string, PluginConfigFieldSchema>;
  initialConfig: Record<string, unknown>;
}

function toFieldValues(configSchema: Record<string, PluginConfigFieldSchema>, config: Record<string, unknown>): Record<string, PluginConfigFieldValue> {
  const values: Record<string, PluginConfigFieldValue> = {};
  for (const [name, field] of Object.entries(configSchema)) {
    const raw = config[name];
    values[name] = field.type === 'boolean' ? raw === true : typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
  }
  return values;
}

/**
 * Toggles between a compact "Edit config" button and an inline edit form
 * for one plugin install row on the Plugins admin page (KAN-124 — the same
 * "create + list only, no way to fix a typo'd definition" gap KAN-100/
 * KAN-109/KAN-117/KAN-119/KAN-120/KAN-121/KAN-123 already closed for their
 * own sibling registries). Reuses `PluginConfigFields`/
 * `parsePluginConfigFieldValues` directly, so an edit renders and validates
 * a config value through the exact same widgets `InstallPluginForm` uses at
 * install time. `pluginId`/`version`/`grantedScopes` are not editable here
 * — see `updatePluginInstallConfig`'s own doc comment. Hidden entirely when
 * the install's own pinned manifest version has no config fields to edit
 * (`configSchema` empty) — same posture `InstallPluginForm`'s own
 * `Object.keys(...).length > 0` guard establishes at install time.
 */
export function EditPluginInstallConfigForm({
  orgId,
  projectId,
  installId,
  configSchema,
  initialConfig,
}: EditPluginInstallConfigFormProps): React.ReactElement | null {
  const t = useTranslations('ProjectPlugins');
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [config, setConfig] = useState<Record<string, PluginConfigFieldValue>>(() => toFieldValues(configSchema, initialConfig));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (Object.keys(configSchema).length === 0) {
    return null;
  }

  function startEditing(): void {
    setConfig(toFieldValues(configSchema, initialConfig));
    setFieldErrors({});
    setError(null);
    setEditing(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const { parsedConfig, fieldErrors: nextFieldErrors } = parsePluginConfigFieldValues(configSchema, config, t('configFieldRequiredError'));
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/plugins/${installId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: parsedConfig }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string; reasons?: string[] } | null;
        if (body?.reasons?.length) {
          setError(body.reasons.join(' '));
        } else {
          setError(t('editConfigError'));
        }
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (!editing) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={startEditing}>
        {t('editConfigButton')}
      </Button>
    );
  }

  return (
    <form className="flex w-full flex-col gap-3" onSubmit={handleSubmit} noValidate>
      <PluginConfigFields
        idPrefix={`edit-plugin-config-${installId}`}
        configSchema={configSchema}
        values={config}
        fieldErrors={fieldErrors}
        onChange={(name, value) => setConfig((prev) => ({ ...prev, [name]: value }))}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {t('saveConfigButton')}
        </Button>
        <Button type="button" variant="outline" disabled={submitting} onClick={() => setEditing(false)}>
          {t('cancelEditConfigButton')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
