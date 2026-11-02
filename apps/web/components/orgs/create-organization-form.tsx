'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CreateOrganizationForm(): React.ReactElement {
  const t = useTranslations('NewOrgPage');
  const router = useRouter();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<'generic' | 'offline' | 'name' | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    if (name.trim() === '') {
      setError('name');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!response.ok) {
        setError('generic');
        return;
      }
      const { organizationId } = (await response.json()) as { organizationId: string };
      router.push(`/orgs/${organizationId}`);
    } catch {
      setError('offline');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="org-name">
          {t('nameLabel')}
        </label>
        <Input
          id="org-name"
          name="name"
          required
          aria-invalid={error === 'name'}
          aria-describedby={error === 'name' ? 'org-name-error' : 'org-name-hint'}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        {error === 'name' ? null : (
          <p id="org-name-hint" className="text-sm text-muted-foreground">
            {t('nameHint')}
          </p>
        )}
      </div>
      {error ? (
        <p id={error === 'name' ? 'org-name-error' : undefined} role="alert" className="text-sm text-destructive">
          {t(error === 'offline' ? 'networkError' : error === 'name' ? 'nameRequired' : 'genericError')}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting}>
        {t('submit')}
      </Button>
    </form>
  );
}
