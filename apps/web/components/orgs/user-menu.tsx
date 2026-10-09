'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { LayoutDashboard, LogOut } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth/auth-context';

/**
 * The header's account menu (Pastel Pulse): the signed-in user's initial and email, a link to the
 * account dashboard and sign-out. Closes on an outside click or Escape.
 */
export function UserMenu(): React.ReactElement | null {
  const t = useTranslations('AppShell');
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // While Firebase restores the session the slot keeps its place, so the header never jumps or
  // looks like it has no account menu.
  if (loading) {
    return <span data-testid="user-menu-loading" aria-hidden="true" className="h-9 w-9 animate-pulse rounded-full bg-pp-surface-container" />;
  }
  if (!user) return null;
  const email = user.email ?? '';
  const initial = (user.displayName || email || '?').trim().charAt(0).toUpperCase();

  async function handleSignOut(): Promise<void> {
    setOpen(false);
    await signOut();
    router.replace('/login');
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('userMenu')}
        className="group flex items-center gap-2 rounded-full ps-0.5 pe-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-pp-primary/40 sm:pe-3"
      >
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-pp-primary-fixed font-pp-display text-pp-label-md text-pp-on-primary-fixed ring-2 ring-pp-primary/20">
          {initial}
          <span
            className="absolute bottom-0 end-0 h-2.5 w-2.5 rounded-full bg-pp-secondary-fixed-dim ring-2 ring-pp-surface-bright"
            aria-hidden="true"
          />
        </span>
        <span className="hidden max-w-[160px] truncate text-pp-label-md text-pp-on-surface lg:inline-block" dir="ltr">
          {email}
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={t('userMenu')}
          className="absolute end-0 top-12 z-40 w-64 space-y-1 rounded-pp bg-pp-surface-container-lowest p-pp-sm shadow-pp-candy-hover"
        >
          <div className="rounded-pp bg-pp-surface-container-low p-pp-sm">
            <p className="text-pp-label-sm uppercase tracking-wider text-pp-outline">{t('signedInAs')}</p>
            <p className="truncate text-pp-label-md text-pp-on-surface" dir="ltr">
              {email}
            </p>
          </div>
          <Link
            href="/dashboard"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-pp px-pp-sm py-2 text-pp-label-md text-pp-on-surface hover:bg-pp-surface-container"
          >
            <LayoutDashboard className="h-4 w-4 text-pp-on-surface-variant" aria-hidden="true" />
            {t('myAccount')}
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleSignOut()}
            className="flex w-full items-center gap-2 rounded-pp px-pp-sm py-2 text-start text-pp-label-md text-pp-error hover:bg-pp-error-container/60"
          >
            <LogOut className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            {t('signOut')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
