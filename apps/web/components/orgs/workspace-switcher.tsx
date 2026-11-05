'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronsUpDown, FolderKanban, LayoutGrid, Plus } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { Workspace } from '@/lib/orgs/workspaces';

export interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  currentOrgId: string;
  /** The project the page is in; absent on organization pages. */
  currentProjectId?: string;
  /** Offer "New project" in the current organization (the viewer may create one). */
  canCreateProject?: boolean;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? '?').slice(0, 2)).toUpperCase();
}

/**
 * Where you are and where else you can go, the same on every page: one card naming the organization
 * and the project, which opens the list of every organization the person belongs to with its
 * projects. A project opens straight into it; an organization opens its home. Closes on Escape, on a
 * click outside and when a link is followed.
 */
export function WorkspaceSwitcher({ workspaces, currentOrgId, currentProjectId, canCreateProject = false }: WorkspaceSwitcherProps): React.ReactElement {
  const t = useTranslations('SidebarWorkspace');
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const panelId = React.useId();
  const current = workspaces.find((workspace) => workspace.orgId === currentOrgId);
  const currentProject = current?.projects.find((project) => project.id === currentProjectId);
  const orgName = current?.orgName ?? t('organization');

  React.useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t('open', { place: currentProject ? `${orgName} / ${currentProject.name}` : orgName })}
        className="flex w-full items-center gap-3 rounded-pp-lg p-2 text-start transition-colors hover:bg-pp-surface-container-high"
        data-testid="workspace-switcher"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pp-primary font-pp-display text-pp-label-md text-pp-on-primary" aria-hidden="true">
          {initials(orgName)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-pp-label-md text-pp-on-surface" dir="auto">
            {orgName}
          </span>
          <span className="truncate text-pp-body-sm text-pp-on-surface-variant" dir="auto">
            {currentProject ? currentProject.name : t('organizationHome')}
          </span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-pp-on-surface-variant" aria-hidden="true" />
      </button>

      {open ? (
        <div
          id={panelId}
          className="absolute inset-x-0 top-full z-40 mt-2 flex max-h-[min(70vh,28rem)] flex-col overflow-y-auto rounded-pp-lg border border-pp-outline-variant/50 bg-pp-surface-container-lowest p-2 shadow-pp-candy"
          data-testid="workspace-switcher-panel"
        >
          <nav aria-label={t('listLabel')} className="flex flex-col gap-2">
            {workspaces.map((workspace) => {
              const isCurrentOrg = workspace.orgId === currentOrgId;
              return (
                <div key={workspace.orgId} className="flex flex-col gap-0.5">
                  <Link
                    href={`/orgs/${workspace.orgId}`}
                    onClick={() => setOpen(false)}
                    aria-current={isCurrentOrg && !currentProjectId ? 'page' : undefined}
                    className="flex items-center gap-2 rounded-pp-lg px-2 py-1.5 text-pp-label-md text-pp-on-surface hover:bg-pp-surface-container-high"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-pp-primary-fixed text-[10px] font-bold text-pp-on-primary-fixed-variant" aria-hidden="true">
                      {initials(workspace.orgName)}
                    </span>
                    <span className="min-w-0 flex-1 truncate" dir="auto">
                      {workspace.orgName}
                    </span>
                    {isCurrentOrg && !currentProjectId ? <Check className="h-4 w-4 text-pp-primary" aria-hidden="true" /> : null}
                  </Link>
                  {workspace.projects.length === 0 ? (
                    <span className="ps-10 text-pp-body-sm text-pp-on-surface-variant">{t('noProjects')}</span>
                  ) : (
                    workspace.projects.map((project) => {
                      const isCurrent = isCurrentOrg && project.id === currentProjectId;
                      return (
                        <Link
                          key={project.id}
                          href={`/orgs/${workspace.orgId}/projects/${project.id}`}
                          onClick={() => setOpen(false)}
                          aria-current={isCurrent ? 'page' : undefined}
                          className={cn(
                            'flex items-center gap-2 rounded-pp-lg py-1.5 pe-2 ps-10 text-pp-body-md',
                            isCurrent ? 'bg-pp-primary-fixed font-semibold text-pp-primary' : 'text-pp-on-surface-variant hover:bg-pp-surface-container-high hover:text-pp-on-surface',
                          )}
                        >
                          <FolderKanban className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate" dir="auto">
                            {project.name}
                          </span>
                          {isCurrent ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                        </Link>
                      );
                    })
                  )}
                </div>
              );
            })}
          </nav>
          <div className="mt-2 flex flex-col gap-0.5 border-t border-pp-outline-variant/40 pt-2">
            {canCreateProject ? (
              <Link href={`/orgs/${currentOrgId}/projects/new`} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-pp-lg px-2 py-1.5 text-pp-body-md text-pp-primary hover:bg-pp-primary-fixed">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('newProject')}
              </Link>
            ) : null}
            <Link href="/dashboard" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-pp-lg px-2 py-1.5 text-pp-body-md text-pp-on-surface-variant hover:bg-pp-surface-container-high">
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              {t('allOrganizations')}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
