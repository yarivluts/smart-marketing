import { getTranslations } from 'next-intl/server';
import type { OrgMemberSummary } from '@growthos/firebase-orm-models';
import { isInvitableRole } from '@growthos/shared';
import { RemoveMemberButton } from './remove-member-button';
import { ChangeRoleControl } from './change-role-control';
import { SuspendMemberButton } from './suspend-member-button';
import { ReactivateMemberButton } from './reactivate-member-button';

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
      {members.map((member) => {
        const changeableRole = isInvitableRole(member.role) ? member.role : null;
        return (
          <li
            key={member.membershipId}
            className="flex items-center justify-between rounded-md border border-input px-3 py-2 text-sm"
          >
            <span>{member.email}</span>
            <div className="flex items-center gap-3">
              {canManageMembers && changeableRole ? (
                <>
                  <ChangeRoleControl orgId={orgId} membershipId={member.membershipId} role={changeableRole} />
                  <span className="text-xs text-muted-foreground">{t('statusLabel', { status: member.status })}</span>
                </>
              ) : (
                <span className="text-muted-foreground">
                  {t('roleAndStatus', { role: member.role, status: member.status })}
                </span>
              )}
              {canManageMembers && member.status === 'active' ? (
                <SuspendMemberButton orgId={orgId} membershipId={member.membershipId} />
              ) : null}
              {canManageMembers && member.status === 'suspended' ? (
                <ReactivateMemberButton orgId={orgId} membershipId={member.membershipId} />
              ) : null}
              {canManageMembers ? <RemoveMemberButton orgId={orgId} membershipId={member.membershipId} /> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
