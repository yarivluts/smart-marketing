'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Search,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import type { AdministeredProject, MemberItem, MemberRole } from './member-types';
import { ChangeRoleControl } from './change-role-control';
import { InviteMemberModal } from './invite-member-modal';
import { Button } from '@/components/ui/button';

export interface MembersTableProps {
  orgId: string;
  members?: MemberItem[];
  canManageMembers?: boolean;
  administeredProjects?: AdministeredProject[];
  onRoleChanged?: (membershipId: string, newRole: MemberRole) => void;
  onStatusChanged?: (membershipId: string, newStatus: 'active' | 'suspended') => void;
  onRemoveMember?: (membershipId: string) => void;
  className?: string;
}

export const DEFAULT_MEMBERS: MemberItem[] = [
  {
    membershipId: 'mem-1',
    name: 'Sarah Connor',
    email: 'sarah.connor@growthos.io',
    role: 'org_admin',
    status: 'active',
    joinedAt: '2026-01-15',
  },
  {
    membershipId: 'mem-2',
    name: 'Alex Mercer',
    email: 'alex.mercer@growthos.io',
    role: 'editor',
    status: 'active',
    joinedAt: '2026-02-01',
  },
  {
    membershipId: 'mem-3',
    name: 'Dana Scully',
    email: 'dana.scully@growthos.io',
    role: 'viewer',
    status: 'active',
    joinedAt: '2026-03-10',
  },
];

export function MembersTable({
  orgId,
  members: initialMembers = DEFAULT_MEMBERS,
  canManageMembers = true,
  administeredProjects = [],
  onRoleChanged,
  onStatusChanged,
  onRemoveMember,
  className = '',
}: MembersTableProps): React.ReactElement {
  const t = useTranslations('Members');
  const [members, setMembers] = useState<MemberItem[]>(initialMembers);
  const [searchQuery, setSearchQuery] = useState('');
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  const filteredMembers = members.filter(
    (m) =>
      searchQuery.trim() === '' ||
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.role.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleRoleChange = (membershipId: string, newRole: MemberRole) => {
    setMembers((prev) =>
      prev.map((m) => (m.membershipId === membershipId ? { ...m, role: newRole } : m)),
    );
    onRoleChanged?.(membershipId, newRole);
  };

  const handleToggleSuspend = async (membershipId: string, currentStatus: string) => {
    const nextStatus: MemberItem['status'] = currentStatus === 'active' ? 'suspended' : 'active';
    setMembers((prev) =>
      prev.map((m) =>
        m.membershipId === membershipId ? { ...m, status: nextStatus } : m,
      ),
    );
    onStatusChanged?.(membershipId, nextStatus);
  };

  const handleRemove = (membershipId: string) => {
    setMembers((prev) => prev.filter((m) => m.membershipId !== membershipId));
    onRemoveMember?.(membershipId);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div
      data-testid="members-table-container"
      className={`flex flex-col gap-5 rounded-2xl border border-border/80 bg-card p-6 shadow-xs ${className}`}
    >
      {/* Header Row: Title & Invite Trigger */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold tracking-tight text-foreground">
              Team Members & Access
            </h3>
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
              {members.length} Members
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage organization permissions, role assignments, and active workspace invitations.
          </p>
        </div>

        {canManageMembers && (
          <Button
            type="button"
            data-testid="open-invite-modal-btn"
            onClick={() => setIsInviteModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold shrink-0 cursor-pointer"
          >
            <UserPlus className="h-4 w-4" />
            <span>{t('invite')}</span>
          </Button>
        )}
      </div>

      {/* Search Input */}
      <div className="relative max-w-sm">
        <Search className="absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          data-testid="search-members-input"
          placeholder="Filter by name, email, or role..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-9 w-full rounded-lg border border-input bg-background ps-9 pe-3 text-xs"
        />
      </div>

      {/* Members Data Table */}
      <div className="overflow-x-auto rounded-xl border border-border/70">
        <table className="w-full text-xs text-start border-collapse">
          <thead>
            <tr className="border-b border-border/80 bg-muted/40 text-muted-foreground font-semibold">
              <th className="py-3 px-4 text-start">Member</th>
              <th className="py-3 px-3 text-start">Role</th>
              <th className="py-3 px-3 text-start">Status</th>
              <th className="py-3 px-3 text-start">Joined</th>
              {canManageMembers && <th className="py-3 px-4 text-end">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {filteredMembers.map((m) => (
              <tr
                key={m.membershipId}
                data-testid={`member-row-${m.membershipId}`}
                className="hover:bg-muted/20 transition-colors"
              >
                {/* Avatar & Name */}
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {getInitials(m.name)}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-foreground truncate">{m.name}</span>
                      <span className="text-[11px] text-muted-foreground truncate">{m.email}</span>
                    </div>
                  </div>
                </td>

                {/* Role Badge or In-place selector */}
                <td className="py-3 px-3">
                  {canManageMembers ? (
                    <ChangeRoleControl
                      orgId={orgId}
                      membershipId={m.membershipId}
                      role={m.role}
                      onRoleChanged={(r) => handleRoleChange(m.membershipId, r)}
                    />
                  ) : (
                    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground capitalize">
                      {m.role.replace('_', ' ')}
                    </span>
                  )}
                </td>

                {/* Status Pill */}
                <td className="py-3 px-3">
                  <span
                    data-testid={`member-status-${m.membershipId}`}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      m.status === 'active'
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : m.status === 'suspended'
                          ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                          : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    {m.status === 'active' ? (
                      <ShieldCheck className="h-3 w-3" />
                    ) : (
                      <ShieldAlert className="h-3 w-3" />
                    )}
                    <span className="capitalize">{m.status}</span>
                  </span>
                </td>

                {/* Joined Date */}
                <td className="py-3 px-3 text-muted-foreground" dir="ltr">
                  {m.joinedAt || '2026-01-01'}
                </td>

                {/* Actions */}
                {canManageMembers && (
                  <td className="py-3 px-4 text-end">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        data-testid={`suspend-btn-${m.membershipId}`}
                        onClick={() => handleToggleSuspend(m.membershipId, m.status)}
                        className="text-xs text-muted-foreground hover:text-foreground font-medium cursor-pointer"
                      >
                        {m.status === 'active' ? 'Suspend' : 'Reactivate'}
                      </button>
                      <button
                        type="button"
                        data-testid={`remove-btn-${m.membershipId}`}
                        onClick={() => handleRemove(m.membershipId)}
                        className="text-xs text-destructive hover:underline font-medium cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invite Member Modal */}
      <InviteMemberModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        orgId={orgId}
        administeredProjects={administeredProjects}
        onInvited={(email, role) => {
          setMembers((prev) => [
            ...prev,
            {
              membershipId: `mem-${Date.now()}`,
              name: email.split('@')[0],
              email,
              role,
              status: 'active',
              joinedAt: new Date().toISOString().split('T')[0],
            },
          ]);
        }}
      />
    </div>
  );
}
