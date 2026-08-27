'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface EditTemplateFormProps {
  orgId: string;
  templateId: string;
  initialName: string;
  initialConfig?: Record<string, unknown> | null;
}

/** Pretty-prints `config` for the textarea, or an empty string when unset (`null` or `undefined`) — mirrors `EditPersonForm`'s "blank means clear" convention for its own optional fields. */
function configToText(config: Record<string, unknown> | null | undefined): string {
  return config == null ? '' : JSON.stringify(config, null, 2);
}

/**
 * Toggles between a compact "Edit" button and an inline edit form for one
 * template row in the org Resource Library's templates section (KAN-117 —
 * the same "create + list only, no way to fix a typo'd name" gap KAN-100
 * closed for the people registry, here for `ResourceTemplateModel`, whose
 * own doc comment always described an edit path that never got built).
 * Saving bumps the template's `version` — already-approved project
 * attachments keep whatever version they were pinned to, per
 * `updateResourceTemplate`'s own doc comment.
 */
export function EditTemplateForm({ orgId, templateId, initialName, initialConfig }: EditTemplateFormProps): React.ReactElement {
  const t = useTranslations('ResourceLibrary');
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [configText, setConfigText] = useState(configToText(initialConfig));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<'save' | 'invalid_config' | null>(null);

  function startEditing(): void {
    setName(initialName);
    setConfigText(configToText(initialConfig));
    setError(null);
    setEditing(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    let config: Record<string, unknown> | undefined;
    const trimmedConfigText = configText.trim();
    if (trimmedConfigText.length > 0) {
      try {
        const parsed: unknown = JSON.parse(trimmedConfigText);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          setError('invalid_config');
          return;
        }
        config = parsed as Record<string, unknown>;
      } catch {
        setError('invalid_config');
        return;
      }
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/resources/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, config }),
      });
      if (!response.ok) {
        setError('save');
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
        {t('editTemplate')}
      </Button>
    );
  }

  return (
    <form className="flex w-full flex-col gap-3" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor={`edit-template-name-${templateId}`}>
          {t('nameLabel')}
        </label>
        <Input
          id={`edit-template-name-${templateId}`}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor={`edit-template-config-${templateId}`}>
          {t('templateConfigLabel')}
        </label>
        <textarea
          id={`edit-template-config-${templateId}`}
          className="min-h-24 rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
          value={configText}
          onChange={(event) => setConfigText(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t('templateConfigHint')}</p>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting || name.trim().length === 0}>
          {t('saveTemplate')}
        </Button>
        <Button type="button" variant="outline" disabled={submitting} onClick={() => setEditing(false)}>
          {t('cancelEditTemplate')}
        </Button>
      </div>
      {error === 'invalid_config' ? (
        <p role="alert" className="text-sm text-destructive">
          {t('templateConfigInvalid')}
        </p>
      ) : null}
      {error === 'save' ? (
        <p role="alert" className="text-sm text-destructive">
          {t('editTemplateError')}
        </p>
      ) : null}
    </form>
  );
}
