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
        className={cn(
          'relative flex flex-1 items-center rounded-pp-lg transition-all duration-150',
          isCollapsed
            ? 'mx-auto h-10 w-10 justify-center'
            : 'justify-between gap-pp-sm px-pp-md py-pp-sm text-pp-label-md',
          active
            ? 'bg-pp-primary-fixed font-semibold text-pp-on-primary-fixed dark:bg-pp-periwinkle/20 dark:text-pp-primary-fixed'
            : 'text-pp-on-surface-variant hover:bg-pp-surface-container-high hover:text-pp-on-surface dark:text-muted-foreground dark:hover:bg-white/5 dark:hover:text-foreground',
        )}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
      >
        <div className={cn('flex min-w-0 items-center', isCollapsed ? 'justify-center' : 'gap-pp-sm')}>
          <Icon
            className={cn(
              'h-5 w-5 shrink-0 transition-colors',
              active ? 'text-pp-primary dark:text-pp-primary-fixed' : 'text-pp-on-surface-variant group-hover:text-pp-on-surface dark:text-muted-foreground',
            )}
            aria-hidden="true"
          />
          {!isCollapsed ? (
            <span className="truncate">{item.label}</span>
          ) : null}
        </div>
        {!isCollapsed && active && !(showBadge && item.badge) ? (
          <span className="ms-auto h-2 w-2 shrink-0 rounded-full bg-pp-primary group-hover:hidden" aria-hidden="true" />
        ) : null}

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
        'sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 select-none flex-col border-e border-transparent bg-pp-surface-container-lowest shadow-sm transition-all duration-200 ease-in-out dark:border-white/10 dark:bg-[#181820]/90 lg:flex',
        isCollapsed ? 'w-16 p-2' : 'w-72 p-pp-md',
        className,
      )}
    >
      {/* Workspace Switcher in Expanded Mode */}
      {!isCollapsed && (organizations.length > 0 || projects.length > 0) ? (
        <div className="mb-pp-md">
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
      <div className="flex-1 space-y-pp-md overflow-y-auto overflow-x-hidden scrollbar-thin">
        {/* Pinned Favorites Section (only when expanded) */}
        {!isCollapsed && pinnedItems.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 px-pp-md py-1 text-pp-label-sm uppercase tracking-wider text-pp-outline">
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
          <div key={section.clusterKey ?? section.heading ?? idx} className="flex flex-col gap-1.5">
            {!isCollapsed ? (
              <span className="px-pp-md py-1 text-pp-label-sm uppercase tracking-wider text-pp-outline">
                {section.heading ?? (section.clusterKey ? tNavClusters(section.clusterKey) : '')}
              </span>
            ) : (
              <div className="my-1 border-b border-pp-outline-variant/30 dark:border-white/10" />
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
      <div className="mt-auto border-t border-pp-outline-variant/30 pt-pp-sm dark:border-white/10">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={isCollapsed ? tNavShell('expandSidebar') : tNavShell('collapseSidebar')}
          title={isCollapsed ? tNavShell('expandSidebar') : tNavShell('collapseSidebar')}
          className={cn(
            'flex items-center rounded-pp-lg text-pp-body-sm text-pp-on-surface-variant transition-colors hover:bg-pp-surface-container-high hover:text-pp-on-surface dark:text-muted-foreground',
            isCollapsed ? 'mx-auto h-10 w-10 justify-center' : 'w-full justify-between px-pp-sm py-2',
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
