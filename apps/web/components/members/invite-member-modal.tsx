'use client';

import React, { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy, Loader2, Mail, UserPlus, X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AdministeredProject, MemberRole } from './member-types';

export interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  administeredProjects?: AdministeredProject[];
  onInvited?: (email: string, role: MemberRole) => void;
}

export function InviteMemberModal({
  isOpen,
  onClose,
  orgId,
  administeredProjects = [],
  onInvited,
}: InviteMemberModalProps): React.ReactElement | null {
  const t = useTranslations('Members');
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('viewer');
  const [projectId, setProjectId] = useState(administeredProjects[0]?.id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  if (!isOpen) return null;

  const isProjectScoped = role === 'project_admin' || role === 'editor' || role === 'operator';

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!email.trim()) return;

    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isProjectScoped ? { email: email.trim(), role, projectId } : { email: email.trim(), role }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      onInvited?.(email.trim(), role);
      setEmail('');
      onClose();
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  }

  const handleCopyLink = () => {
    const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/invite/${orgId}?role=${role}`;
    void navigator.clipboard?.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4 animate-fade-in">
      <div
        data-testid="invite-member-modal"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl animate-scale-in"
      >
        <div className="flex items-center justify-between pb-4 border-b border-border/70">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                {t('invite')} Member
              </h3>
              <p className="text-xs text-muted-foreground">
                Send an email invitation or share a direct join link.
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="close-invite-modal-btn"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4 text-xs">
          {/* Email Input */}
          <div className="flex flex-col gap-1.5">
            <label className="font-semibold text-foreground" htmlFor="modal-invite-email">
              {t('inviteEmailLabel')}
            </label>
            <Input
              id="modal-invite-email"
              data-testid="modal-invite-email-input"
              type="email"
              required
              placeholder="colleague@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 text-xs"
            />
          </div>

          {/* Role Dropdown */}
          <div className="flex flex-col gap-1.5">
            <label className="font-semibold text-foreground" htmlFor="modal-invite-role">
              {t('inviteRoleLabel')}
            </label>
            <select
              id="modal-invite-role"
              data-testid="modal-invite-role-select"
              value={role}
              onChange={(e) => setRole(e.target.value as MemberRole)}
              className="h-10 rounded-md border border-input bg-background px-3 text-xs"
            >
              <option value="viewer">Viewer (Read-only)</option>
              <option value="editor">Editor (Create & update campaigns/goals)</option>
              <option value="operator">Operator (Run automation & syncs)</option>
              <option value="org_admin">Admin (Full workspace access)</option>
            </select>
          </div>

          {/* Project Picker (if project scoped) */}
          {isProjectScoped && administeredProjects.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="font-semibold text-foreground" htmlFor="modal-invite-project">
                {t('inviteProjectLabel')}
              </label>
              <select
                id="modal-invite-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-xs"
              >
                {administeredProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <p role="alert" className="text-xs text-destructive">
              {t('inviteError')}
            </p>
          )}

          {/* Copy Link vs Send Invite Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-border/70">
            <button
              type="button"
              data-testid="copy-invite-link-btn"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium cursor-pointer"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Link Copied!' : 'Copy Direct Link'}</span>
            </button>

            <Button
              type="submit"
              data-testid="modal-submit-invite-btn"
              disabled={submitting || !email.trim()}
              className="rounded-xl px-5 py-2 text-xs font-semibold"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin me-1.5" />
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <Mail className="h-3.5 w-3.5 me-1.5" />
                  <span>{t('invite')}</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
