'use client';

import * as React from 'react';
import { Bell, LogOut, Menu, Shield, Sparkles, User, X } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from './language-switcher';
import { CommandPalette } from './command-palette';
import { WorkspaceSwitcher, type WorkspaceOrg, type WorkspaceProject } from './workspace-switcher';
import { useShell } from './shell-context';
import { PageGuideButton } from '@/components/guides/page-guide-button';
import { cn } from '@/lib/utils';

export interface HeaderProps {
  brandName?: string;
  organizations?: WorkspaceOrg[];
  currentOrgId?: string;
  projects?: WorkspaceProject[];
  currentProjectId?: string;
  currentEnv?: string;
  userEmail?: string;
  onMobileMenuToggle?: () => void;
  isMobileMenuOpen?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function EnvironmentBadge({ env = 'dev' }: { env?: string }): React.ReactElement {
  const normalizedEnv = env.toLowerCase();

  const envConfigs: Record<string, { label: string; badgeClass: string; dotClass: string; pingClass: string }> = {
    prod: {
      label: 'PROD',
      badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
      dotClass: 'bg-emerald-500',
      pingClass: 'bg-emerald-400',
    },
    staging: {
      label: 'STAGING',
      badgeClass: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20',
      dotClass: 'bg-sky-500',
      pingClass: 'bg-sky-400',
    },
    dev: {
      label: 'DEV',
      badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
      dotClass: 'bg-amber-500',
      pingClass: 'bg-amber-400',
    },
  };

  const current = envConfigs[normalizedEnv] ?? envConfigs.dev;

  return (
    <div
      aria-label={`Environment: ${current.label}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wider transition-colors shadow-soft',
        current.badgeClass,
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', current.pingClass)} />
        <span className={cn('relative inline-flex rounded-full h-1.5 w-1.5', current.dotClass)} />
      </span>
      <span>{current.label}</span>
    </div>
  );
}

export function NotificationBell(): React.ReactElement {
  const [isOpen, setIsOpen] = React.useState(false);
  const [unreadCount, setUnreadCount] = React.useState(3);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const notifications = [
    {
      id: '1',
      title: 'Webhook Stream Ingesting',
      time: '12m ago',
      unread: true,
    },
    {
      id: '2',
      title: 'Missing Integration Alert',
      time: '1h ago',
      unread: true,
    },
    {
      id: '3',
      title: 'Monthly MRR Milestone Reached',
      time: '3h ago',
      unread: true,
    },
  ];

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Notifications"
        aria-expanded={isOpen}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-input bg-card text-foreground transition-colors hover:bg-muted shadow-soft"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -top-1 -end-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#7064F4] px-1 text-[10px] font-bold text-white shadow-soft animate-pulse">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-label="Notifications Panel"
          className="absolute end-0 top-full mt-2 w-80 rounded-2xl border border-border bg-popover/95 p-3 text-popover-foreground shadow-soft-xl backdrop-blur-xl z-50 animate-slide-down"
        >
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <span className="text-xs font-bold text-foreground">Notifications</span>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => setUnreadCount(0)}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="mt-2 space-y-1.5 max-h-60 overflow-y-auto">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={cn(
                  'flex items-start gap-2.5 rounded-xl p-2 text-xs transition-colors hover:bg-muted/70',
                  n.unread && unreadCount > 0 ? 'bg-primary/5' : '',
                )}
              >
                <span className="mt-0.5 flex h-2 w-2 rounded-full bg-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{n.title}</p>
                  <p className="text-[10px] text-muted-foreground">{n.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function UserProfileMenu({
  userEmail,
  currentOrgId,
}: {
  userEmail: string;
  currentOrgId?: string;
}): React.ReactElement {
  const [isOpen, setIsOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const initial = userEmail.charAt(0).toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="User Profile Menu"
        aria-expanded={isOpen}
        className="group flex items-center gap-2 rounded-xl border border-border/80 bg-card/80 ps-1.5 pe-2.5 py-1 text-xs shadow-soft transition-all hover:bg-muted/80 focus:outline-none"
      >
        <div className="relative flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary font-bold transition-transform group-hover:scale-105">
          {initial}
          <span
            aria-label="Status: Active"
            className="absolute bottom-0 end-0 h-2 w-2 rounded-full bg-[#55EFC4] ring-2 ring-background"
          />
        </div>
        <span className="hidden sm:inline-block max-w-[130px] truncate text-foreground font-medium">
          {userEmail}
        </span>
      </button>

      {isOpen ? (
        <div
          role="menu"
          aria-label="User menu"
          className="absolute end-0 top-full mt-2 w-64 rounded-2xl border border-border bg-popover/95 p-2 text-popover-foreground shadow-soft-xl backdrop-blur-xl z-50 animate-slide-down space-y-1"
        >
          <div className="p-2 border-b border-border/60">
            <div className="flex items-center gap-2">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary font-bold">
                {initial}
                <span className="absolute bottom-0 end-0 h-2 w-2 rounded-full bg-[#55EFC4] ring-2 ring-background" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">{userEmail}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="inline-flex items-center rounded-full bg-[#55EFC4]/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                    Online
                  </span>
                  <span className="text-[10px] text-muted-foreground">Admin</span>
                </div>
              </div>
            </div>
          </div>

          <div className="py-1">
            {currentOrgId ? (
              <Link
                href={`/orgs/${currentOrgId}/settings`}
                onClick={() => setIsOpen(false)}
                role="menuitem"
                className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
              >
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Account & Organization Settings</span>
              </Link>
            ) : null}
            <Link
              href="/pricing"
              onClick={() => setIsOpen(false)}
              role="menuitem"
              className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
            >
              <Shield className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Subscription & Plans</span>
            </Link>
          </div>

          <div className="pt-1 border-t border-border/60">
            <Link
              href="/login"
              onClick={() => setIsOpen(false)}
              role="menuitem"
              className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Header({
  brandName = 'GrowthOS',
  organizations = [],
  currentOrgId,
  projects = [],
  currentProjectId,
  currentEnv = 'dev',
  userEmail,
  onMobileMenuToggle,
  isMobileMenuOpen,
  className,
  children,
}: HeaderProps): React.ReactElement {
  let shellContext: ReturnType<typeof useShell> | null = null;
  try {
    shellContext = useShell();
  } catch {
    // Gracefully handle usage outside ShellProvider if any
  }

  const mobileOpen = isMobileMenuOpen ?? shellContext?.mobileMenuOpen ?? false;
  const toggleMobile = onMobileMenuToggle ?? (shellContext ? () => shellContext.setMobileMenuOpen(!shellContext.mobileMenuOpen) : undefined);

  return (
    <header
      aria-label="Top Navigation"
      className={cn(
        'sticky top-0 z-30 flex h-16 w-full items-center justify-between gap-4 border-b border-border/80 bg-glass px-4 sm:px-6 backdrop-blur-md shadow-soft transition-all select-none',
        className,
      )}
    >
      {/* Brand & Left Navigation */}
      <div className="flex items-center gap-3.5 min-w-0">
        {toggleMobile ? (
          <button
            type="button"
            onClick={toggleMobile}
            aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileOpen}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-input bg-card text-foreground lg:hidden shadow-soft hover:bg-muted"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        ) : null}

        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-soft transition-transform group-hover:scale-105">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="hidden sm:inline-block font-bold text-lg tracking-tight bg-brand-gradient bg-clip-text text-transparent">
            {brandName}
          </span>
        </Link>

        {organizations.length > 0 || projects.length > 0 ? (
          <div className="hidden lg:flex items-center gap-2.5">
            <div className="w-56">
              <WorkspaceSwitcher
                organizations={organizations}
                currentOrgId={currentOrgId}
                projects={projects}
                currentProjectId={currentProjectId}
                currentEnv={currentEnv}
              />
            </div>
            <EnvironmentBadge env={currentEnv} />
          </div>
        ) : currentEnv ? (
          <div className="hidden lg:block">
            <EnvironmentBadge env={currentEnv} />
          </div>
        ) : null}

        {children}
      </div>

      {/* Center Command Palette Search (Desktop & Tablet) */}
      <div className="hidden sm:flex flex-1 max-w-md mx-2">
        <CommandPalette orgId={currentOrgId} projectId={currentProjectId} />
      </div>

      {/* Right Controls & Profile */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        <PageGuideButton variant="pill" className="hidden sm:inline-flex" />
        <PageGuideButton variant="inline" className="sm:hidden" />
        <NotificationBell />
        <LanguageSwitcher compact />

        {userEmail ? (
          <UserProfileMenu userEmail={userEmail} currentOrgId={currentOrgId} />
        ) : null}
      </div>
    </header>
  );
}
