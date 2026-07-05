'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const RESOURCE_TEMPLATE_TYPES = ['metric_definition', 'schema', 'dashboard', 'guardrail_policy'] as const;

export interface CreateTemplateFormProps {
  orgId: string;
}

export function CreateTemplateForm({ orgId }: CreateTemplateFormProps): React.ReactElement {
  const t = useTranslations('ResourceLibrary');
  const router = useRouter();
  const [name, setName] = useState('');
  const [type, setType] = useState<(typeof RESOURCE_TEMPLATE_TYPES)[number]>('metric_definition');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/resources/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      setName('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="template-name">
          {t('nameLabel')}
        </label>
        <Input id="template-name" required value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="template-type">
          {t('templateTypeLabel')}
        </label>
        <select
          id="template-type"
          value={type}
          onChange={(event) => setType(event.target.value as (typeof RESOURCE_TEMPLATE_TYPES)[number])}
          className="h-10 rounded-md border border-input bg-background px-2 text-sm"
        >
          {RESOURCE_TEMPLATE_TYPES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={submitting}>
        {t('createTemplate')}
      </Button>
      {error ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {t('createError')}
        </p>
      ) : null}
    </form>
  );
}
