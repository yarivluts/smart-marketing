'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface CreateBoardFormProps {
  orgId: string;
  projectId: string;
}

/** Creates an empty board, then navigates straight to it — tiles are added from the board's own grid editor (KAN-60 AC: "build a board with 6 tiles without code"). */
export function CreateBoardForm({ orgId, projectId }: CreateBoardFormProps): React.ReactElement {
  const t = useTranslations('Boards');
  const router = useRouter();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/boards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        setError(t('createError'));
        return;
      }
      const body = (await response.json()) as { board: { id: string } };
      setName('');
      router.push(`/orgs/${orgId}/projects/${projectId}/boards/${body.board.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex items-end gap-3" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="create-board-name">
          {t('nameLabel')}
        </label>
        <Input
          id="create-board-name"
          required
          placeholder={t('namePlaceholder')}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting || name.trim().length === 0}>
        {t('createButton')}
      </Button>
    </form>
  );
}
