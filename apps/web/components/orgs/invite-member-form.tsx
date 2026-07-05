'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { INVITABLE_ROLES, type InvitableRole } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface InviteMemberFormProps {
  orgId: string;
}

export function InviteMemberForm({ orgId }: InviteMemberFormProps): React.ReactElement {
  const t = useTranslations('Members');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitableRole>('viewer');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      setEmail('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="invite-email">
          {t('inviteEmailLabel')}
        </label>
        <Input
          id="invite-email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="invite-role">
          {t('inviteRoleLabel')}
        </label>
        <select
          id="invite-role"
          value={role}
          onChange={(event) => setRole(event.target.value as InvitableRole)}
          className="h-10 rounded-md border border-input bg-background px-2 text-sm"
        >
          {INVITABLE_ROLES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={submitting}>
        {t('invite')}
      </Button>
      {error ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {t('inviteError')}
        </p>
      ) : null}
    </form>
  );
}
