'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface EditApiKeyNameFormProps {
  orgId: string;
  projectId: string;
  apiKeyId: string;
  initialName: string;
}

/**
 * Toggles between a compact "Rename" button and an inline rename form for
 * one API key row on the project Keys admin page (KAN-126 — the same
 * "create + list only, no way to fix a typo'd name" gap KAN-100/117/119/
 * 120/121/123/124 already closed for their own sibling registries).
 * `scopes`/`environmentId` aren't editable here — see `renameApiKey`'s own
 * doc comment.
 */
export function EditApiKeyNameForm({ orgId, projectId, apiKeyId, initialName }: EditApiKeyNameFormProps): React.ReactElement {
  const t = useTranslations('ApiKeys');
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  function startEditing(): void {
    setName(initialName);
    setError(false);
    setEditing(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/keys/${apiKeyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        setError(true);
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
        {t('rename')}
      </Button>
    );
  }

  return (
    <form className="flex flex-col items-end gap-2" onSubmit={handleSubmit} noValidate>
      <label className="sr-only" htmlFor={`edit-api-key-name-${apiKeyId}`}>
        {t('nameLabel')}
      </label>
      <Input
        id={`edit-api-key-name-${apiKeyId}`}
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="h-8 w-40 text-sm"
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={submitting || name.trim().length === 0}>
          {t('saveRename')}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={submitting} onClick={() => setEditing(false)}>
          {t('cancelRename')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('renameError')}
        </p>
      ) : null}
    </form>
  );
}
