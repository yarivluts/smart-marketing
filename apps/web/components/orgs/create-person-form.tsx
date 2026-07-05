'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface CreatePersonFormProps {
  orgId: string;
}

export function CreatePersonForm({ orgId }: CreatePersonFormProps): React.ReactElement {
  const t = useTranslations('ResourceLibrary');
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/resources/people`, {
        method: 'POST',
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
      setName('');
      setEmail('');
      setTitle('');
      setPhotoUrl('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="person-name">
          {t('nameLabel')}
        </label>
        <Input id="person-name" required value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="person-email">
          {t('personEmailLabel')}
        </label>
        <Input
          id="person-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="person-title">
          {t('personTitleLabel')}
        </label>
        <Input id="person-title" value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="person-photo-url">
          {t('personPhotoUrlLabel')}
        </label>
        <Input id="person-photo-url" type="url" value={photoUrl} onChange={(event) => setPhotoUrl(event.target.value)} />
      </div>
      <Button type="submit" disabled={submitting}>
        {t('createPerson')}
      </Button>
      {error ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {t('createError')}
        </p>
      ) : null}
    </form>
  );
}
