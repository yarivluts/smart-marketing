'use client';

import * as React from 'react';
import { Building2, Check, ChevronsUpDown, FolderOpen, Search } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface WorkspaceOrg {
  id: string;
  name: string;
  slug?: string;
}

export interface WorkspaceProject {
  id: string;
  name: string;
  env?: string;
}

export interface WorkspaceSwitcherProps {
  organizations?: WorkspaceOrg[];
  currentOrgId?: string;
  projects?: WorkspaceProject[];
  currentProjectId?: string;
  currentEnv?: string;
  className?: string;
}

export function WorkspaceSwitcher({
  organizations = [],
  currentOrgId,
  projects = [],
  currentProjectId,
  currentEnv = 'dev',
  className,
}: WorkspaceSwitcherProps): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const dropdownRef = React.useRef<HTMLDivElement | null>(null);

  const currentOrg = organizations.find((o) => o.id === currentOrgId) ?? organizations[0];
  const currentProject = projects.find((p) => p.id === currentProjectId) ?? projects[0];

  React.useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const filteredOrgs = organizations.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase()),
  );

  function handleSelectOrg(orgId: string) {
    setOpen(false);
    router.push(`/orgs/${orgId}`);
  }

  function handleSelectProject(projectId: string) {
    setOpen(false);
    if (currentOrgId) {
      router.push(`/orgs/${currentOrgId}/projects/${projectId}/campaigns`);
    }
  }

  return (
    <div ref={dropdownRef} className={cn('relative w-full', className)}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-label="Switch workspace or project"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2.5 rounded-xl border border-border/80 bg-card p-2 text-start shadow-soft transition-all hover:bg-muted/50 hover:border-border focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Building2 className="h-4 w-4" />
        </div>
        <div className="flex flex-1 flex-col min-w-0">
          <span className="truncate text-xs font-medium text-muted-foreground leading-tight">
            {currentOrg?.name ?? 'Select Organization'}
          </span>
          <span className="truncate text-sm font-semibold text-foreground leading-tight">
            {currentProject?.name ?? 'All Projects'}
          </span>
        </div>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground/60" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Workspace and Project Selector"
          className="absolute start-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-border/80 bg-card p-2 text-card-foreground shadow-soft-xl animate-zoom-in-95"
        >
          <div className="relative mb-2">
            <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workspaces..."
              aria-label="Search workspaces"
              className="h-9 w-full rounded-lg border border-input bg-background ps-8 pe-3 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="max-h-64 overflow-y-auto space-y-3">
            {organizations.length > 0 ? (
              <div>
                <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Organizations
                </div>
                <div className="space-y-0.5">
                  {filteredOrgs.map((org) => {
                    const isSelected = org.id === currentOrgId;
                    return (
                      <button
                        key={org.id}
                        type="button"
                        onClick={() => handleSelectOrg(org.id)}
                        className={cn(
                          'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-start transition-colors',
                          isSelected
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-foreground hover:bg-muted/80',
                        )}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Building2 className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{org.name}</span>
                        </div>
                        {isSelected ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {projects.length > 0 ? (
              <div>
                <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Projects
                </div>
                <div className="space-y-0.5">
                  {filteredProjects.map((project) => {
                    const isSelected = project.id === currentProjectId;
                    return (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => handleSelectProject(project.id)}
                        className={cn(
                          'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-start transition-colors',
                          isSelected
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-foreground hover:bg-muted/80',
                        )}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{project.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {project.env || currentEnv ? (
                            <Badge variant="secondary" size="sm" className="text-[9px] py-0 px-1.5">
                              {project.env ?? currentEnv}
                            </Badge>
                          ) : null}
                          {isSelected ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
