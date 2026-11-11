'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { invitableRolesForScope, isProjectInvitableRole, type InviteRole } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const ALL_INVITE_ROLES: readonly InviteRole[] = [
  ...invitableRolesForScope('org'),
  ...invitableRolesForScope('project'),
];

// Deliberately loose: one @ and a dot in the domain. The server is the real check.
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ERROR_KEY = {
  bad_email: 'inviteErrorBadEmail',
  already_member: 'inviteErrorAlreadyMember',
  failed: 'inviteError',
} as const;

export interface InviteMemberFormProject {
  id: string;
  name: string;
}

export interface InviteMemberFormProps {
  orgId: string;
  /**
   * Projects the signed-in inviter administers (`project.manage`) — scopes
   * the project picker that appears once a project-scoped role
   * (`project_admin`/`editor`/`operator`) is selected (KAN-135). An org-scope
   * admin administers every project in the org; a project-scope admin only
   * their own. Never used for an org-scoped role.
   */
  administeredProjects: readonly InviteMemberFormProject[];
}

export function InviteMemberForm({ orgId, administeredProjects }: InviteMemberFormProps): React.ReactElement {
  const t = useTranslations('Members');
  const tRoles = useTranslations('Roles');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('viewer');
  const [projectId, setProjectId] = useState(administeredProjects[0]?.id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<'bad_email' | 'already_member' | 'failed' | null>(null);

  const projectScoped = isProjectInvitableRole(role);
  const canSubmit = !projectScoped || (administeredProjects.length > 0 && projectId.length > 0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    if (!LOOKS_LIKE_EMAIL.test(email.trim())) {
      setError('bad_email');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectScoped ? { email, role, projectId } : { email, role }),
      });
      if (!response.ok) {
        setError(response.status === 409 ? 'already_member' : 'failed');
        return;
      }
      setEmail('');
      router.refresh();
    } catch {
      setError('failed');
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
          dir="ltr"
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
          onChange={(event) => setRole(event.target.value as InviteRole)}
          aria-describedby="invite-role-hint"
          className="h-10 rounded-md border border-input bg-background px-2 text-sm"
        >
          {ALL_INVITE_ROLES.map((value) => (
            <option key={value} value={value}>
              {tRoles(value)}
            </option>
          ))}
        </select>
        <p id="invite-role-hint" className="max-w-xs text-xs text-muted-foreground">
          {t(`inviteRoleHint.${role}`)}
        </p>
      </div>
      {projectScoped ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="invite-project">
            {t('inviteProjectLabel')}
          </label>
          {administeredProjects.length > 0 ? (
            <select
              id="invite-project"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-2 text-sm"
            >
              {administeredProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-muted-foreground">{t('inviteProjectNone')}</p>
          )}
        </div>
      ) : null}
      <Button type="submit" disabled={submitting || !canSubmit}>
        {t('invite')}
      </Button>
      {error !== null ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {t(ERROR_KEY[error])}
        </p>
      ) : null}
    </form>
  );
}
