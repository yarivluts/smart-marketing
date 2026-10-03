'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Bell, BellOff, LogOut, Menu, Network, Shield, User, X } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { LanguageSwitcher } from './language-switcher';
import { CommandPalette } from './command-palette';
import { WorkspaceSwitcher, type WorkspaceOrg, type WorkspaceProject } from './workspace-switcher';
import { useShell } from './shell-context';
import { PageGuideButton } from '@/components/guides/page-guide-button';
import { useAuth } from '@/lib/auth/auth-context';
import { cn } from '@/lib/utils';

export interface HeaderProps {
  brandName?: string;
  organizations?: WorkspaceOrg[];
  currentOrgId?: string;
  projects?: WorkspaceProject[];
  currentProjectId?: string;
  currentEnv?: string;
  userEmail?: string;
  /** Real notifications for the signed-in user. Omitted → honest empty state. */
  notifications?: ShellNotification[];
  onMobileMenuToggle?: () => void;
  isMobileMenuOpen?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export interface ShellNotification {
  id: string;
  title: string;
  /** Pre-formatted relative time (e.g. "12m ago"). */
  time: string;
  unread: boolean;
  href?: string;
}

/** Stitch top-bar round icon button (`w-9 h-9 rounded-full bg-surface-container`). */
const iconButtonClass =
  'relative flex h-9 w-9 items-center justify-center rounded-full bg-pp-surface-container text-pp-on-surface-variant transition-colors hover:bg-pp-surface-container-high hover:text-pp-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-pp-primary/40 dark:bg-white/5 dark:text-muted-foreground dark:hover:bg-white/10';

const popoverClass =
  'absolute end-0 top-full z-50 mt-2 animate-slide-down rounded-pp-lg bg-pp-surface-container-lowest p-pp-sm text-pp-on-surface shadow-pp-candy-hover ring-1 ring-pp-outline-variant/30 dark:bg-popover dark:text-popover-foreground';

function useDismissable(isOpen: boolean, close: () => void): React.RefObject<HTMLDivElement | null> {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!isOpen) return undefined;
    function handleClickOutside(event: MouseEvent): void {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') close();
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, close]);
  return ref;
}

export function EnvironmentBadge({ env = 'dev' }: { env?: string }): React.ReactElement {
  const normalizedEnv = env.toLowerCase();

  const envConfigs: Record<string, { label: string; badgeClass: string; dotClass: string; pingClass: string }> = {
    prod: {
      label: 'PROD',
      badgeClass: 'bg-pp-secondary-container/40 text-pp-on-secondary-container',
      dotClass: 'bg-pp-secondary',
      pingClass: 'bg-pp-secondary-fixed-dim',
    },
    staging: {
      label: 'STAGING',
      badgeClass: 'bg-sky-100 text-sky-800 dark:bg-sky-500/10 dark:text-sky-300',
      dotClass: 'bg-sky-500',
      pingClass: 'bg-sky-400',
    },
    dev: {
      label: 'DEV',
      badgeClass: 'bg-amber-100 text-amber-900 dark:bg-amber-500/10 dark:text-amber-300',
      dotClass: 'bg-amber-500',
      pingClass: 'bg-amber-400',
    },
  };

  const current = envConfigs[normalizedEnv] ?? envConfigs.dev;

  return (
    <div
      aria-label={`Environment: ${current.label}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-pp-label-sm tracking-wider transition-colors',
        current.badgeClass,
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', current.pingClass)} />
        <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', current.dotClass)} />
      </span>
      <span>{current.label}</span>
    </div>
  );
}

export function NotificationBell({
  notifications = [],
}: {
  notifications?: ShellNotification[];
}): React.ReactElement {
  const t = useTranslations('ShellHeader');
  const [isOpen, setIsOpen] = React.useState(false);
  const [readIds, setReadIds] = React.useState<ReadonlySet<string>>(() => new Set());
  const close = React.useCallback(() => setIsOpen(false), []);
  const menuRef = useDismissable(isOpen, close);

  const unreadCount = notifications.filter((n) => n.unread && !readIds.has(n.id)).length;

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={t('notifications')}
        aria-expanded={isOpen}
        className={iconButtonClass}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -end-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-pp-primary px-1 text-[10px] font-bold text-pp-on-primary ring-2 ring-pp-surface-bright">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div role="dialog" aria-label={t('notificationsPanel')} className={cn(popoverClass, 'w-80')}>
          <div className="flex items-center justify-between px-pp-sm pb-pp-sm pt-1">
            <span className="font-pp-display text-pp-label-md text-pp-on-surface">{t('notifications')}</span>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => setReadIds(new Set(notifications.map((n) => n.id)))}
                className="text-pp-label-sm text-pp-primary hover:underline"
              >
                {t('markAllRead')}
              </button>
            ) : null}
          </div>
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-pp-sm rounded-pp bg-pp-surface-container-low px-pp-md py-pp-lg text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-pp-primary-fixed text-pp-primary">
                <BellOff className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="text-pp-label-md text-pp-on-surface">{t('caughtUp')}</p>
              <p className="text-pp-body-sm text-pp-on-surface-variant">{t('caughtUpHint')}</p>
            </div>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {notifications.map((n) => {
                const unread = n.unread && !readIds.has(n.id);
                const body = (
                  <>
                    <span
                      className={cn(
                        'mt-1.5 flex h-2 w-2 shrink-0 rounded-full',
                        unread ? 'bg-pp-primary' : 'bg-pp-outline-variant',
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-pp-label-md text-pp-on-surface">{n.title}</p>
                      <p className="text-pp-body-sm text-pp-outline">{n.time}</p>
                    </div>
                  </>
                );
                const rowClass = cn(
                  'flex items-start gap-pp-sm rounded-pp p-pp-sm transition-colors hover:bg-pp-surface-container-high',
                  unread ? 'bg-pp-primary-fixed/40' : '',
                );
                return n.href ? (
                  <Link key={n.id} href={n.href} onClick={close} className={rowClass}>
                    {body}
                  </Link>
                ) : (
                  <div key={n.id} className={rowClass}>
                    {body}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** `useAuth` throws outside `<AuthProvider>`; the header must still render in isolation (tests, error pages). */
function useOptionalSignOut(): (() => Promise<void>) | null {
  try {
    return useAuth().signOut;
  } catch {
    return null;
  }
}

export function UserProfileMenu({
  userEmail,
  currentOrgId,
}: {
  userEmail: string;
  currentOrgId?: string;
}): React.ReactElement {
  const t = useTranslations('ShellHeader');
  const router = useRouter();
  const signOut = useOptionalSignOut();
  const [isOpen, setIsOpen] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);
  const close = React.useCallback(() => setIsOpen(false), []);
  const menuRef = useDismissable(isOpen, close);

  const initial = userEmail.charAt(0).toUpperCase();

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    try {
      // Clears both the Firebase client session and the server session cookie.
      if (signOut) await signOut();
    } finally {
      setSigningOut(false);
      close();
      router.push('/login');
    }
  }

  const itemClass =
    'flex w-full items-center gap-pp-sm rounded-pp px-pp-sm py-2 text-start text-pp-label-md text-pp-on-surface transition-colors hover:bg-pp-surface-container-high';

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={t('profileMenu')}
        aria-expanded={isOpen}
        className="group flex items-center gap-2 rounded-full ps-0.5 pe-1 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-pp-primary/40 sm:pe-3"
      >
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-pp-primary-fixed font-pp-display text-pp-label-md text-pp-on-primary-fixed shadow-sm ring-2 ring-pp-primary/20 transition-transform group-hover:scale-105">
          {initial}
          <span
            aria-label={t('statusSignedIn')}
            className="absolute bottom-0 end-0 h-2.5 w-2.5 rounded-full bg-pp-secondary-fixed-dim ring-2 ring-pp-surface-bright"
          />
        </span>
        <span className="hidden max-w-[140px] truncate text-pp-label-md text-pp-on-surface sm:inline-block">
          {userEmail}
        </span>
      </button>

      {isOpen ? (
        <div role="menu" aria-label={t('userMenu')} className={cn(popoverClass, 'w-64 space-y-1')}>
          <div className="flex items-center gap-pp-sm rounded-pp bg-pp-surface-container-low p-pp-sm">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pp-primary-fixed font-pp-display text-pp-label-md text-pp-on-primary-fixed">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-pp-label-sm uppercase tracking-wider text-pp-outline">{t('signedInAs')}</p>
              <p className="truncate text-pp-label-md text-pp-on-surface">{userEmail}</p>
            </div>
          </div>

          <div className="py-1">
            {currentOrgId ? (
              <Link href={`/orgs/${currentOrgId}/settings`} onClick={close} role="menuitem" className={itemClass}>
                <User className="h-4 w-4 text-pp-on-surface-variant" />
                <span>{t('accountSettings')}</span>
              </Link>
            ) : null}
            <Link href="/pricing" onClick={close} role="menuitem" className={itemClass}>
              <Shield className="h-4 w-4 text-pp-on-surface-variant" />
              <span>{t('plans')}</span>
            </Link>
          </div>

          <div className="border-t border-pp-outline-variant/30 pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className={cn(itemClass, 'text-pp-error hover:bg-pp-error-container/60 disabled:opacity-60')}
            >
              <LogOut className="h-4 w-4" />
              <span>{t('signOut')}</span>
            </button>
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
  notifications,
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
        'sticky top-0 z-30 flex h-16 w-full select-none items-center justify-between gap-pp-md bg-pp-surface-bright/95 px-pp-md shadow-sm backdrop-blur-md transition-all dark:bg-[#121218]/90 sm:px-pp-lg',
        className,
      )}
    >
      {/* Brand & Left Navigation */}
      <div className="flex min-w-0 items-center gap-pp-md lg:gap-pp-lg">
        {toggleMobile ? (
          <button
            type="button"
            onClick={toggleMobile}
            aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileOpen}
            className={cn(iconButtonClass, 'lg:hidden')}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        ) : null}

        <Link href="/" className="group flex items-center gap-pp-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-pp-primary text-pp-on-primary shadow-sm shadow-pp-primary/30 transition-transform group-hover:scale-105">
            <Network className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="hidden font-pp-display text-pp-headline-md font-bold tracking-tight text-pp-primary dark:text-pp-primary-fixed sm:inline-block">
            {brandName}
          </span>
        </Link>

        {organizations.length > 0 || projects.length > 0 ? (
          <div className="hidden items-center gap-pp-sm lg:flex">
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
      <div className="mx-2 hidden max-w-md flex-1 sm:flex">
        <CommandPalette orgId={currentOrgId} projectId={currentProjectId} />
      </div>

      {/* Right Controls & Profile */}
      <div className="flex shrink-0 items-center gap-pp-sm sm:gap-pp-md">
        <PageGuideButton variant="pill" className="hidden sm:inline-flex" />
        <PageGuideButton variant="inline" className="sm:hidden" />
        <NotificationBell notifications={notifications} />
        <LanguageSwitcher compact />
        <span className="mx-1 hidden h-6 w-px bg-pp-outline-variant/50 sm:block" aria-hidden="true" />

        {userEmail ? (
          <UserProfileMenu userEmail={userEmail} currentOrgId={currentOrgId} />
        ) : null}
      </div>
    </header>
  );
}
