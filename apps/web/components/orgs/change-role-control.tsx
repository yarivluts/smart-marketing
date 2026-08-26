'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { INVITABLE_ROLES, type InvitableRole } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';

export interface ChangeRoleControlProps {
  orgId: string;
  membershipId: string;
  role: InvitableRole;
}

/**
 * The "change role" admin surface `org-membership-flows.emulator.test.ts`'s
 * own doc comment named as not existing yet — moves an already-invitable
 * member (`org_admin`/`viewer`) between those two roles in place, instead of
 * the previous only option (revoke + re-invite, which loses membership
 * history and drops access until the new invite is accepted). Committing on
 * `onChange` mirrors `CampaignTargetInput`/`GoalTargetInput`'s commit-on-edit
 * pattern; a select has no separate "blur without changing" case to guard
 * against the way a free-text input does.
 */
export function ChangeRoleControl({ orgId, membershipId, role }: ChangeRoleControlProps): React.ReactElement {
  const t = useTranslations('Members');
  const router = useRouter();
  const [value, setValue] = useState<InvitableRole>(role);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(event: React.ChangeEvent<HTMLSelectElement>): Promise<void> {
    const nextRole = event.target.value as InvitableRole;
    const previousValue = value;
    setValue(nextRole);
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/members/${membershipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!response.ok) {
        setError(t('changeRoleError'));
        setValue(previousValue);
        return;
      }
      router.refresh();
    } catch {
      setError(t('changeRoleError'));
      setValue(previousValue);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        aria-label={t('changeRoleLabel')}
        value={value}
        disabled={pending}
        onChange={(event) => void handleChange(event)}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
      >
        {INVITABLE_ROLES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
