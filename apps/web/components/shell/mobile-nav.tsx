'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Pin, X } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { resolveShellIcon } from './shell-icons';
import type { NavShellItem, NavShellSection, WorkspaceOrg, WorkspaceProject } from './nav-types';
import { useShell } from './shell-context';
import { WorkspaceSwitcher } from './workspace-switcher';
import { CommandPalette } from './command-palette';
import { LanguageSwitcher } from './language-switcher';
import { cn } from '@/lib/utils';

export interface MobileNavProps {
  organizations?: WorkspaceOrg[];
  currentOrgId?: string;
  projects?: WorkspaceProject[];
  currentProjectId?: string;
  currentEnv?: string;
  sections: NavShellSection[];
  mobileTabItems?: NavShellItem[];
  activeHref?: string;
}

export function MobileDrawer({
  organizations = [],
  currentOrgId,
  projects = [],
  currentProjectId,
  currentEnv = 'dev',
  sections,
  activeHref,
}: MobileNavProps): React.ReactElement | null {
  const tNavClusters = useTranslations('NavClusters');
  const tNavShell = useTranslations('NavShell');
  const { mobileMenuOpen, setMobileMenuOpen, pinnedItemIds } = useShell();

  // Aggregate all items
  const allItemsMap = React.useMemo(() => {
    const map = new Map<string, NavShellItem>();
    for (const section of sections) {
      for (const item of section.items) {
        const key = item.id ?? item.href;
        if (!map.has(key)) {
          map.set(key, item);
        }
      }
    }
    return map;
  }, [sections]);

  const pinnedItems = React.useMemo(() => {
    return pinnedItemIds
      .map((id) => allItemsMap.get(id))
      .filter((item): item is NavShellItem => Boolean(item));
  }, [pinnedItemIds, allItemsMap]);

  if (!mobileMenuOpen) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 top-16 z-40 flex flex-col bg-background/80 backdrop-blur-md lg:hidden animate-fade-in"
      onClick={() => setMobileMenuOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation drawer"
        className="flex max-h-[calc(100vh-4rem)] w-full flex-col gap-4 overflow-y-auto border-b border-[#ECE8F6] dark:border-white/10 bg-[#F5F3FB]/95 dark:bg-[#1E1E24]/95 backdrop-blur-xl p-4 shadow-soft-xl animate-slide-down"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Workspace Switcher */}
        {organizations.length > 0 || projects.length > 0 ? (
          <WorkspaceSwitcher
            organizations={organizations}
            currentOrgId={currentOrgId}
            projects={projects}
            currentProjectId={currentProjectId}
            currentEnv={currentEnv}
          />
        ) : null}

        {/* Command Search Trigger */}
        <CommandPalette orgId={currentOrgId} projectId={currentProjectId} />

        {/* Navigation Sections */}
        <nav className="flex flex-col gap-4 py-2">
          {/* Pinned Favorites */}
          {pinnedItems.length > 0 ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                <Pin className="h-3 w-3 text-amber-500" />
                <span>{tNavClusters('favorites')}</span>
              </div>
              {pinnedItems.map((item) => {
                const Icon = resolveShellIcon(item.icon);
                const active = item.href === activeHref;
                return (
                  <Link
                    key={`mobile-fav-${item.id ?? item.href}`}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-[#EBE9FD] dark:bg-[#7064F4]/20 text-[#7064F4] text-primary font-semibold shadow-soft'
                        : 'text-foreground hover:bg-[#ECE8F6]/70 dark:hover:bg-white/5',
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className="h-4 w-4 shrink-0 text-[#7064F4]" />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ) : null}

          {/* 6 Functional Clusters */}
          {sections.map((section, idx) => (
            <div key={section.clusterKey ?? section.heading ?? idx} className="flex flex-col gap-1">
              <span className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                {section.heading ?? (section.clusterKey ? tNavClusters(section.clusterKey) : '')}
              </span>
              {section.items.map((item) => {
                const Icon = resolveShellIcon(item.icon);
                const active = item.href === activeHref;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={
                      cn(
                        'flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'bg-[#EBE9FD] dark:bg-[#7064F4]/20 text-[#7064F4] text-primary font-semibold shadow-soft'
                          : 'text-foreground hover:bg-[#ECE8F6]/70 dark:hover:bg-white/5',
                      ) + (active ? ' bg-primary/10' : '')
                    }
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon
                        className={cn(
                          'h-4 w-4 shrink-0',
                          active ? 'text-[#7064F4]' : 'text-muted-foreground',
                        )}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom Drawer Actions */}
        <div className="flex items-center justify-between border-t border-[#ECE8F6] dark:border-white/10 pt-3">
          <LanguageSwitcher />
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label={tNavShell('closeMenu')}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-input px-3 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
            <span>{tNavShell('closeMenu')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function MobileBottomBar({
  mobileTabItems = [],
  activeHref,
}: {
  mobileTabItems?: NavShellItem[];
  activeHref?: string;
}): React.ReactElement | null {
  if (mobileTabItems.length === 0) return null;

  return (
    <nav
      aria-label="Mobile Quick Shortcuts"
      className="fixed inset-x-0 bottom-0 mb-6 z-30 mx-auto flex h-16 w-[calc(100%-2rem)] max-w-md items-center justify-around rounded-full border border-white/10 bg-[#1E1E24]/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl shadow-[0_20px_40px_-4px_rgba(30,30,36,0.32),0_6px_16px_-2px_rgba(112,100,244,0.16)] md:hidden lg:hidden"
    >
      {mobileTabItems.map((item) => {
        const Icon = resolveShellIcon(item.icon);
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'group relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-1.5 transition-all duration-200',
              active
                ? 'bg-[#2D3436] text-[#EBE9FD] text-primary font-bold shadow-soft'
                : 'text-[#9B99A8] hover:bg-[#2D3436]/60 hover:text-white',
            )}
            aria-current={active ? 'page' : undefined}
          >
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-105',
                active ? 'text-[#7064F4] text-primary' : 'text-[#9B99A8] group-hover:text-white',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            </div>
            <span className={cn('truncate max-w-[64px] text-center text-[10px] tracking-tight leading-none', active ? 'text-[#EBE9FD]' : '')}>
              {item.label}
            </span>
            {active ? (
              <span className="absolute -bottom-1 h-1 w-1 rounded-full bg-[#7064F4]" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
