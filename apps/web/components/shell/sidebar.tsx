'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  ChevronsLeft,
  ChevronsRight,
  Pin,
  Star,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { resolveShellIcon } from './shell-icons';
import type { NavShellItem, NavShellSection, WorkspaceOrg, WorkspaceProject } from './nav-types';
import { useShell } from './shell-context';
import { WorkspaceSwitcher } from './workspace-switcher';
import { cn } from '@/lib/utils';

export interface SidebarProps {
  organizations?: WorkspaceOrg[];
  currentOrgId?: string;
  projects?: WorkspaceProject[];
  currentProjectId?: string;
  currentEnv?: string;
  sections: NavShellSection[];
  activeHref?: string;
  className?: string;
}

function BadgeElement({
  badge,
  variant = 'default',
}: {
  badge: string;
  variant?: 'default' | 'secondary' | 'success' | 'warning' | 'alert' | 'destructive';
}): React.ReactElement {
  const variantStyles = {
    default: 'bg-primary/10 text-primary',
    secondary: 'bg-muted text-muted-foreground',
    success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300',
    alert: 'bg-red-50 text-red-700 dark:bg-red-950/80 dark:text-red-300 animate-pulse',
    destructive: 'bg-destructive/10 text-destructive',
  };

  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 transition-colors',
        variantStyles[variant] ?? variantStyles.default,
      )}
    >
      {badge}
    </span>
  );
}

function SidebarLinkItem({
  item,
  active,
  isCollapsed,
  isPinned,
  onTogglePin,
  tNavShell,
  showBadge = true,
}: {
  item: NavShellItem;
  active: boolean;
  isCollapsed: boolean;
  isPinned: boolean;
  onTogglePin: (id: string) => void;
  tNavShell: (key: string) => string;
  showBadge?: boolean;
}): React.ReactElement {
  const Icon = resolveShellIcon(item.icon);
  const itemId = item.id ?? item.href;

  return (
    <div className="group relative flex items-center">
      <Link
        href={item.href}
        className={
          cn(
            'flex flex-1 items-center rounded-xl transition-all duration-150 relative',
            isCollapsed
              ? 'h-10 w-10 justify-center mx-auto'
              : 'justify-between px-3 py-2 text-sm font-medium gap-3',
            active
              ? 'bg-[#EBE9FD] dark:bg-[#7064F4]/20 text-[#7064F4] font-semibold shadow-soft'
              : 'text-muted-foreground hover:bg-[#ECE8F6]/60 dark:hover:bg-white/5 hover:text-foreground',
          ) + (active ? ' bg-primary/10' : '')
        }
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
      >
        <div className={cn('flex items-center min-w-0', isCollapsed ? 'justify-center' : 'gap-3')}>
          <Icon
            className={cn(
              'h-4 w-4 shrink-0 transition-colors',
              active ? 'text-[#7064F4] text-primary' : 'text-muted-foreground group-hover:text-foreground',
            )}
            aria-hidden="true"
          />
          {!isCollapsed ? (
            <span className="truncate">{item.label}</span>
          ) : null}
        </div>

        {!isCollapsed && showBadge && item.badge ? (
          <div className="flex items-center gap-1.5 ms-auto pe-5 group-hover:pe-0 transition-all">
            <BadgeElement badge={item.badge} variant={item.badgeVariant} />
          </div>
        ) : null}

        {isCollapsed && showBadge && item.badge ? (
          <span className="absolute top-1.5 end-1.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
        ) : null}
      </Link>

      {/* Pin to favorites button (visible on hover when expanded) */}
      {!isCollapsed ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTogglePin(itemId);
          }}
          aria-label={isPinned ? tNavShell('unpinFavorite') : tNavShell('pinFavorite')}
          title={isPinned ? tNavShell('unpinFavorite') : tNavShell('pinFavorite')}
          className={cn(
            'absolute end-2 h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 transition-all hover:bg-background/80 hover:text-foreground',
            isPinned
              ? 'flex text-amber-500 hover:text-amber-600'
              : 'hidden group-hover:flex opacity-0 group-hover:opacity-100',
          )}
        >
          <Star
            className={cn('h-3.5 w-3.5', isPinned ? 'fill-amber-500 text-amber-500' : '')}
          />
        </button>
      ) : null}

      {/* Tooltip on collapsed rail */}
      {isCollapsed ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute start-full top-1/2 z-50 ms-3 -translate-y-1/2 hidden whitespace-nowrap rounded-lg border border-border bg-popover px-3 py-1.5 text-xs font-medium text-popover-foreground shadow-soft-lg group-hover:flex items-center gap-2 animate-fade-in"
        >
          <span>{item.label}</span>
          {item.badge ? (
            <BadgeElement badge={item.badge} variant={item.badgeVariant} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function Sidebar({
  organizations = [],
  currentOrgId,
  projects = [],
  currentProjectId,
  currentEnv = 'dev',
  sections,
  activeHref,
  className,
}: SidebarProps): React.ReactElement {
  const tNavClusters = useTranslations('NavClusters');
  const tNavShell = useTranslations('NavShell');
  const { isCollapsed, toggleCollapsed, pinnedItemIds, togglePin, isPinned } = useShell();

  // Aggregate all items to find pinned items
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

  return (
    <aside
      aria-label="Sidebar Navigation"
      className={cn(
        'hidden lg:flex shrink-0 flex-col border-e border-[#ECE8F6] dark:border-white/10 bg-[#F5F3FB]/75 dark:bg-[#181820]/80 backdrop-blur-md sticky top-16 h-[calc(100vh-4rem)] transition-all duration-200 ease-in-out select-none',
        isCollapsed ? 'w-16 p-2' : 'w-64 p-3.5',
        className,
      )}
    >
      {/* Workspace Switcher in Expanded Mode */}
      {!isCollapsed && (organizations.length > 0 || projects.length > 0) ? (
        <div className="mb-4">
          <WorkspaceSwitcher
            organizations={organizations}
            currentOrgId={currentOrgId}
            projects={projects}
            currentProjectId={currentProjectId}
            currentEnv={currentEnv}
          />
        </div>
      ) : null}

      {/* Navigation Sections List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-5 scrollbar-thin">
        {/* Pinned Favorites Section (only when expanded) */}
        {!isCollapsed && pinnedItems.length > 0 ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
              <Pin className="h-3 w-3 text-amber-500" />
              <span>{tNavClusters('favorites')}</span>
            </div>

            {pinnedItems.map((item) => (
              <SidebarLinkItem
                key={`fav-${item.id ?? item.href}`}
                item={item}
                active={item.href === activeHref}
                isCollapsed={isCollapsed}
                isPinned={true}
                onTogglePin={togglePin}
                tNavShell={tNavShell}
                showBadge={false}
              />
            ))}
          </div>
        ) : null}

        {/* 6 Functional Clusters */}
        {sections.map((section, idx) => (
          <div key={section.clusterKey ?? section.heading ?? idx} className="flex flex-col gap-1">
            {!isCollapsed ? (
              <span className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                {section.heading ?? (section.clusterKey ? tNavClusters(section.clusterKey) : '')}
              </span>
            ) : (
              <div className="my-1 border-b border-[#ECE8F6] dark:border-white/10" />
            )}

            {section.items.map((item) => (
              <SidebarLinkItem
                key={item.href}
                item={item}
                active={item.href === activeHref}
                isCollapsed={isCollapsed}
                isPinned={isPinned(item.id ?? item.href)}
                onTogglePin={togglePin}
                tNavShell={tNavShell}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Sidebar Footer with Collapse Toggle */}
      <div className="pt-3 mt-auto border-t border-[#ECE8F6] dark:border-white/10">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={isCollapsed ? tNavShell('expandSidebar') : tNavShell('collapseSidebar')}
          title={isCollapsed ? tNavShell('expandSidebar') : tNavShell('collapseSidebar')}
          className={cn(
            'flex items-center rounded-xl text-xs font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors',
            isCollapsed ? 'h-10 w-10 justify-center mx-auto' : 'w-full px-3 py-2 justify-between',
          )}
        >
          {!isCollapsed ? (
            <>
              <span>{tNavShell('collapseSidebar')}</span>
              <ChevronsLeft className="h-4 w-4 rtl:rotate-180" />
            </>
          ) : (
            <ChevronsRight className="h-4 w-4 rtl:rotate-180" />
          )}
        </button>
      </div>
    </aside>
  );
}
