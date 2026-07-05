import { getTranslations } from 'next-intl/server';
import type { OrgMemberSummary } from '@growthos/firebase-orm-models';

export interface MembersListProps {
  members: OrgMemberSummary[];
}

export async function MembersList({ members }: MembersListProps): Promise<React.ReactElement> {
  const t = await getTranslations('Members');

  return (
    <ul className="flex flex-col gap-2">
      {members.map((member) => (
        <li
          key={member.membershipId}
          className="flex items-center justify-between rounded-md border border-input px-3 py-2 text-sm"
        >
          <span>{member.email}</span>
          <span className="text-muted-foreground">{t('roleAndStatus', { role: member.role, status: member.status })}</span>
        </li>
      ))}
    </ul>
  );
}
