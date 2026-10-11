import { getTranslations } from 'next-intl/server';
import { InitialsAvatar } from '@/components/viz/initials-avatar';
import type { OrgMemberSummary } from '@growthos/firebase-orm-models';
import { isInvitableRole } from '@growthos/shared';
import { RemoveMemberButton } from './remove-member-button';
import { ChangeRoleControl } from './change-role-control';
import { SuspendMemberButton } from './suspend-member-button';
import { ReactivateMemberButton } from './reactivate-member-button';

export interface MembersListProject {
  id: string;
  name: string;
}

export interface MembersListProps {
  orgId: string;
  members: OrgMemberSummary[];
  /** Renders a revoke/remove action per row — gated the same as the invite form, on `members.manage`. */
  canManageMembers: boolean;
  /** Resolves a project-scoped member's `projectId` (KAN-135) to a display name — see `roleAndStatus` vs `projectRoleAndStatus` below. */
  projects: readonly MembersListProject[];
}

export async function MembersList({
  orgId,
  members,
  canManageMembers,
  projects,
}: MembersListProps): Promise<React.ReactElement> {
  const t = await getTranslations('Members');

  return (
    <ul className="flex flex-col gap-2">
      {members.map((member) => {
        const changeableRole = isInvitableRole(member.role) ? member.role : null;
        const memberProjectName = member.projectId
          ? (projects.find((project) => project.id === member.projectId)?.name ?? member.projectId)
          : undefined;
        return (
          <li
            key={member.membershipId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background/60 px-3 py-2 text-sm"
          >
            <span className="flex min-w-0 items-center gap-3">
              <InitialsAvatar name={member.displayName || member.email} seed={member.userId} size="sm" />
              <span className="truncate">{member.email}</span>
            </span>
            <div className="flex items-center gap-3">
              {canManageMembers && changeableRole ? (
                <>
                  <ChangeRoleControl orgId={orgId} membershipId={member.membershipId} role={changeableRole} />
                  <span className="text-xs text-muted-foreground">{t('statusLabel', { status: member.status })}</span>
                </>
              ) : (
                <span className="text-muted-foreground">
                  {memberProjectName
                    ? t('projectRoleAndStatus', { role: member.role, project: memberProjectName, status: member.status })
                    : t('roleAndStatus', { role: member.role, status: member.status })}
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
