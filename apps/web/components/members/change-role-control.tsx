'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import type { MemberRole } from './member-types';

export interface ChangeRoleControlProps {
  orgId: string;
  membershipId: string;
  role: MemberRole;
  onRoleChanged?: (newRole: MemberRole) => void;
  className?: string;
}

export const ALL_MEMBER_ROLES: MemberRole[] = [
  'org_admin',
  'project_admin',
  'editor',
  'operator',
  'viewer',
];

export function ChangeRoleControl({
  orgId,
  membershipId,
  role: currentRole,
  onRoleChanged,
  className = '',
}: ChangeRoleControlProps): React.ReactElement {
  const t = useTranslations('Members');
  const router = useRouter();
  const [role, setRole] = useState<MemberRole>(currentRole);
  const [saving, setSaving] = useState(false);

  async function handleChange(newRole: MemberRole): Promise<void> {
    setRole(newRole);
    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/members/${membershipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        onRoleChanged?.(newRole);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <label htmlFor={`change-role-${membershipId}`} className="sr-only">
        {t('changeRoleLabel')}
      </label>
      <select
        id={`change-role-${membershipId}`}
        aria-label={t('changeRoleLabel')}
        value={role}
        disabled={saving}
        onChange={(e) => handleChange(e.target.value as MemberRole)}
        className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground hover:border-border transition-colors cursor-pointer disabled:opacity-50"
      >
        <option value="org_admin">Admin</option>
        <option value="editor">Editor</option>
        <option value="viewer">Viewer</option>
        <option value="operator">Operator</option>
        <option value="project_admin">Project Admin</option>
      </select>
    </div>
  );
}

export const RoleSelector = ChangeRoleControl;
