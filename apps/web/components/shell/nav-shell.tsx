'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Award,
  BarChart3,
  Bell,
  Bot,
  Building2,
  Database,
  Filter,
  FlaskConical,
  FolderOpen,
  GitBranch,
  Gauge,
  Grid3x3,
  Headset,
  Home,
  KeyRound,
  LayoutGrid,
  Megaphone,
  MessageSquare,
  Presentation,
  Puzzle,
  Receipt,
  Rows3,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Tv,
  UserX,
  Users,
  Video,
  Webhook,
} from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { Header } from './header';
import { CommandDialog } from './command-dialog';
import { WorkspaceSwitcher, type WorkspaceOrg, type WorkspaceProject } from './workspace-switcher';
import { cn } from '@/lib/utils';

export const SHELL_ICONS = {
  Activity,
  Award,
  BarChart3,
  Bell,
  Bot,
  Building2,
  Database,
  Filter,
  FlaskConical,
  FolderOpen,
  GitBranch,
  Gauge,
  Grid3x3,
  Headset,
  Home,
  KeyRound,
  LayoutGrid,
  Megaphone,
  MessageSquare,
  Presentation,
  Puzzle,
  Receipt,
  Rows3,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Tv,
  UserX,
  Users,
  Video,
  Webhook,
} satisfies Record<string, LucideIcon>;

export type ShellIconName = keyof typeof SHELL_ICONS;

export interface NavShellItem {
  href: string;
  label: string;
  icon: ShellIconName;
  badge?: string;
}

export interface NavShellSection {
  heading?: string;
  items: NavShellItem[];
}

export interface NavShellProps {
  brandName?: string;
  organizations?: WorkspaceOrg[];
  currentOrgId?: string;
  projects?: WorkspaceProject[];
  currentProjectId?: string;
  currentEnv?: string;
  userEmail?: string;
  sections: NavShellSection[];
  mobileTabItems?: NavShellItem[];
  children: React.ReactNode;
}

function bestMatchingHref(pathname: string, hrefs: readonly string[]): string | undefined {
  let best: string | undefined;
  for (const href of hrefs) {
    const matches = pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (!best || href.length > best.length)) {
      best = href;
    }
  }
  return best;
}

function SidebarLink({
  item,
  active,
  onClick,
}: {
  item: NavShellItem;
  active: boolean;
  onClick?: () => void;
}): React.ReactElement {
  const Icon = SHELL_ICONS[item.icon] ?? Activity;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        'group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150',
        active
          ? 'bg-primary/10 text-primary font-semibold shadow-soft'
          : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Icon
          className={cn(
            'h-4 w-4 shrink-0 transition-colors',
            active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
          )}
          aria-hidden="true"
        />
        <span className="truncate">{item.label}</span>
      </div>
      {item.badge ? (
        <span className="rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-semibold">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

export function NavShell({
  brandName = 'GrowthOS',
  organizations = [],
  currentOrgId,
  projects = [],
  currentProjectId,
  currentEnv = 'dev',
  userEmail,
  sections,
  mobileTabItems = [],
  children,
}: NavShellProps): React.ReactElement {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const allHrefs = React.useMemo(() => {
    return [
      ...sections.flatMap((s) => s.items.map((i) => i.href)),
      ...mobileTabItems.map((i) => i.href),
    ];
  }, [sections, mobileTabItems]);

  const activeHref = bestMatchingHref(pathname, allHrefs);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Floating Top Header */}
      <Header
        brandName={brandName}
        organizations={organizations}
        currentOrgId={currentOrgId}
        projects={projects}
        currentProjectId={currentProjectId}
        currentEnv={currentEnv}
        userEmail={userEmail}
        onMobileMenuToggle={() => setMobileMenuOpen((o) => !o)}
        isMobileMenuOpen={mobileMenuOpen}
      />

      <div className="flex flex-1">
        {/* Desktop Sticky Sidebar */}
        <aside className="hidden md:flex w-64 shrink-0 flex-col gap-6 border-e border-border/80 bg-card/60 p-4 backdrop-blur-sm sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
          {organizations.length > 0 || projects.length > 0 ? (
            <WorkspaceSwitcher
              organizations={organizations}
              currentOrgId={currentOrgId}
              projects={projects}
              currentProjectId={currentProjectId}
              currentEnv={currentEnv}
            />
          ) : null}

          <div className="md:hidden">
            <CommandDialog orgId={currentOrgId} projectId={currentProjectId} />
          </div>

          <nav className="flex flex-col gap-5">
            {sections.map((section, idx) => (
              <div key={section.heading ?? idx} className="flex flex-col gap-1">
                {section.heading ? (
                  <span className="px-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                    {section.heading}
                  </span>
                ) : null}
                {section.items.map((item) => (
                  <SidebarLink
                    key={item.href}
                    item={item}
                    active={item.href === activeHref}
                  />
                ))}
              </div>
            ))}
          </nav>
        </aside>

        {/* Mobile Slide-Down Drawer */}
        {mobileMenuOpen ? (
          <div className="fixed inset-x-0 top-16 z-20 flex max-h-[calc(100vh-4rem)] flex-col gap-4 overflow-y-auto border-b border-border bg-card p-4 shadow-soft-xl md:hidden animate-slide-down">
            {organizations.length > 0 || projects.length > 0 ? (
              <WorkspaceSwitcher
                organizations={organizations}
                currentOrgId={currentOrgId}
                projects={projects}
                currentProjectId={currentProjectId}
                currentEnv={currentEnv}
              />
            ) : null}

            <CommandDialog orgId={currentOrgId} projectId={currentProjectId} />

            <nav className="flex flex-col gap-4">
              {sections.map((section, idx) => (
                <div key={section.heading ?? idx} className="flex flex-col gap-1">
                  {section.heading ? (
                    <span className="px-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                      {section.heading}
                    </span>
                  ) : null}
                  {section.items.map((item) => (
                    <SidebarLink
                      key={item.href}
                      item={item}
                      active={item.href === activeHref}
                      onClick={() => setMobileMenuOpen(false)}
                    />
                  ))}
                </div>
              ))}
            </nav>
          </div>
        ) : null}

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 pb-24 md:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Shortcut Tab Bar */}
      {mobileTabItems.length > 0 ? (
        <nav className="fixed inset-x-0 bottom-0 z-20 flex items-stretch justify-around border-t border-border/80 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden shadow-soft-lg">
          {mobileTabItems.map((item) => {
            const Icon = SHELL_ICONS[item.icon] ?? Activity;
            const active = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors',
                  active ? 'text-primary font-bold' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
