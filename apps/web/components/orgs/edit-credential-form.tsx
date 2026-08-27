'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface EditCredentialFormProps {
  orgId: string;
  credentialId: string;
  initialName: string;
  initialAvailableScopes: readonly string[];
}

/** Comma-joins scopes for the input, or an empty string when there are none — mirrors `CreateCredentialForm`'s own comma-separated convention for the same field. */
function scopesToText(scopes: readonly string[]): string {
  return scopes.join(', ');
}

/**
 * Toggles between a compact "Edit" button and an inline edit form for one
 * credential row in the org Resource Library's credentials section (KAN-119
 * — the same "create + list only, no way to fix a typo'd name" gap KAN-100/
 * KAN-117 already closed for the people registry and templates, here for
 * `SharedCredentialModel`, which had no edit path at all). `provider` isn't
 * editable — see `updateSharedCredential`'s own doc comment for why. Saving
 * always sends the full comma-separated scope list back, even if unchanged,
 * since `availableScopes` is a full replace, not a sparse patch.
 */
export function EditCredentialForm({
  orgId,
  credentialId,
  initialName,
  initialAvailableScopes,
}: EditCredentialFormProps): React.ReactElement {
  const t = useTranslations('ResourceLibrary');
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [scopesText, setScopesText] = useState(scopesToText(initialAvailableScopes));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  function startEditing(): void {
    setName(initialName);
    setScopesText(scopesToText(initialAvailableScopes));
    setError(false);
    setEditing(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(false);
    setSubmitting(true);
    try {
      const availableScopes = scopesText
        .split(',')
        .map((scope) => scope.trim())
        .filter((scope) => scope.length > 0);
      const response = await fetch(`/api/orgs/${orgId}/resources/credentials/${credentialId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, availableScopes }),
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
        {t('editCredential')}
      </Button>
    );
  }

  return (
    <form className="flex w-full flex-col gap-3" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor={`edit-credential-name-${credentialId}`}>
          {t('nameLabel')}
        </label>
        <Input
          id={`edit-credential-name-${credentialId}`}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor={`edit-credential-scopes-${credentialId}`}>
          {t('availableScopesLabel')}
        </label>
        <Input
          id={`edit-credential-scopes-${credentialId}`}
          placeholder={t('availableScopesPlaceholder')}
          value={scopesText}
          onChange={(event) => setScopesText(event.target.value)}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting || name.trim().length === 0}>
          {t('saveCredential')}
        </Button>
        <Button type="button" variant="outline" disabled={submitting} onClick={() => setEditing(false)}>
          {t('cancelEditCredential')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {t('editCredentialError')}
        </p>
      ) : null}
    </form>
  );
}
