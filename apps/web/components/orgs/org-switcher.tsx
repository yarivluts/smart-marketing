'use client';

import { useTranslations } from 'next-intl';
import type { UserOrgMembership } from '@growthos/firebase-orm-models';
import { useRouter } from '@/i18n/navigation';

export interface OrgSwitcherProps {
  memberships: UserOrgMembership[];
  currentOrgId: string;
}

/** Lists only the orgs the signed-in user is an active member of (KAN-25 AC — never pending invites). */
export function OrgSwitcher({ memberships, currentOrgId }: OrgSwitcherProps): React.ReactElement {
  const t = useTranslations('OrgSwitcher');
  const router = useRouter();
  const activeMemberships = memberships.filter((membership) => membership.status !== 'invited');

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>): void {
    router.push(`/orgs/${event.target.value}`);
  }

  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>{t('label')}</span>
      <select
        aria-label={t('label')}
        value={currentOrgId}
        onChange={handleChange}
        className="rounded-md border border-input bg-background px-2 py-1"
      >
        {activeMemberships.map((membership) => (
          <option key={membership.organizationId} value={membership.organizationId}>
            {membership.organizationName}
          </option>
        ))}
      </select>
    </label>
  );
}
