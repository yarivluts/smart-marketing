'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface EditPersonFormProps {
  orgId: string;
  personId: string;
  initialName: string;
  initialEmail?: string;
  initialTitle?: string;
  initialPhotoUrl?: string;
}

/** Toggles between a compact "Edit" button and an inline edit form for one person row in the org's people registry (KAN-99). */
export function EditPersonForm({
  orgId,
  personId,
  initialName,
  initialEmail,
  initialTitle,
  initialPhotoUrl,
}: EditPersonFormProps): React.ReactElement {
  const t = useTranslations('ResourceLibrary');
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail ?? '');
  const [title, setTitle] = useState(initialTitle ?? '');
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  function startEditing(): void {
    setName(initialName);
    setEmail(initialEmail ?? '');
    setTitle(initialTitle ?? '');
    setPhotoUrl(initialPhotoUrl ?? '');
    setError(false);
    setEditing(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/resources/people/${personId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email: email || undefined,
          title: title || undefined,
          photoUrl: photoUrl || undefined,
        }),
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
        {t('editPerson')}
      </Button>
    );
  }

  return (
    <form className="flex w-full flex-wrap items-end gap-3" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor={`edit-person-name-${personId}`}>
          {t('nameLabel')}
        </label>
        <Input id={`edit-person-name-${personId}`} required value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor={`edit-person-email-${personId}`}>
          {t('personEmailLabel')}
        </label>
        <Input
          id={`edit-person-email-${personId}`}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor={`edit-person-title-${personId}`}>
          {t('personTitleLabel')}
        </label>
        <Input id={`edit-person-title-${personId}`} value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor={`edit-person-photo-url-${personId}`}>
          {t('personPhotoUrlLabel')}
        </label>
        <Input
          id={`edit-person-photo-url-${personId}`}
          type="url"
          value={photoUrl}
          onChange={(event) => setPhotoUrl(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={submitting || name.trim().length === 0}>
        {t('savePerson')}
      </Button>
      <Button type="button" variant="outline" disabled={submitting} onClick={() => setEditing(false)}>
        {t('cancelEditPerson')}
      </Button>
      {error ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {t('editPersonError')}
        </p>
      ) : null}
    </form>
  );
}
