import { getTranslations } from 'next-intl/server';
import type { OrgMemberSummary } from '@growthos/firebase-orm-models';
import { RemoveMemberButton } from './remove-member-button';

export interface MembersListProps {
  orgId: string;
  members: OrgMemberSummary[];
  /** Renders a revoke/remove action per row — gated the same as the invite form, on `members.manage`. */
  canManageMembers: boolean;
}

export async function MembersList({ orgId, members, canManageMembers }: MembersListProps): Promise<React.ReactElement> {
  const t = await getTranslations('Members');

  return (
    <ul className="flex flex-col gap-2">
      {members.map((member) => (
        <li
          key={member.membershipId}
          className="flex items-center justify-between rounded-md border border-input px-3 py-2 text-sm"
        >
          <span>{member.email}</span>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">
              {t('roleAndStatus', { role: member.role, status: member.status })}
            </span>
            {canManageMembers ? <RemoveMemberButton orgId={orgId} membershipId={member.membershipId} /> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
