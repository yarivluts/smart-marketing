'use client';

import { useState, type ReactNode } from 'react';
import {
  Activity,
  BarChart3,
  Bot,
  Building2,
  Database,
  FolderOpen,
  GitBranch,
  Gauge,
  Home,
  KeyRound,
  LayoutGrid,
  Menu,
  Plug,
  Puzzle,
  Receipt,
  ShieldCheck,
  Target,
  Trophy,
  Tv,
  Users,
  Video,
  Webhook,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * Every icon a nav item can reference, keyed by name rather than passed as a
 * component reference or a pre-rendered element. A plain function component
 * (or an element whose `type` is one) can't cross the server->client RSC
 * boundary — `layout.tsx` (server) building nav items with `icon: <Home />`
 * and this ('use client') file later `cloneElement`-ing them looks fine and
 * even passes `next dev` (what CI's e2e suite runs against), but crashes for
 * real with React error #130 ("element type is invalid... got undefined")
 * under an actual production build, since a bare lucide-react component has
 * no client-reference registration for the bundler to reconstruct it from.
 * A string key is trivially serializable, so the layouts pass one of these
 * names and only this client file ever touches the actual icon components.
 */
const ICONS = {
  Activity,
  BarChart3,
  Bot,
  Building2,
  Database,
  FolderOpen,
  GitBranch,
  Gauge,
  Home,
  KeyRound,
  LayoutGrid,
  Plug,
  Puzzle,
  Receipt,
  ShieldCheck,
  Target,
  Trophy,
  Tv,
  Users,
  Video,
  Webhook,
} satisfies Record<string, LucideIcon>;

export type AppShellIconName = keyof typeof ICONS;

export interface AppShellNavItem {
  href: string;
  label: string;
  icon: AppShellIconName;
}

export interface AppShellNavSection {
  heading?: string;
  items: AppShellNavItem[];
}

export interface AppShellProps {
  /** Org switcher / project switcher / env badge — rendered above the nav sections in the sidebar and mobile menu. */
  switchers?: ReactNode;
  sections: AppShellNavSection[];
  /** Up to ~5 of the most-used items, for the mobile bottom tab bar (an Intercom/native-app-style shortcut row, not a full nav replacement — the same items are also in `sections`). */
  mobileTabItems: AppShellNavItem[];
  children: ReactNode;
}

/**
 * The single best-matching href for the current path, across every nav item
 * this shell knows about — "most specific match wins" rather than every
 * href independently prefix-matching, which would otherwise mark a broad
 * item (e.g. the org root) active on every one of its sibling sub-pages too
 * (`/orgs/org-1` is a path-prefix of `/orgs/org-1/resources`, but they're
 * siblings, not parent/child, in nav terms).
 */
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

function NavLink({ item, active, onClick }: { item: AppShellNavItem; active: boolean; onClick?: () => void }): React.ReactElement {
  const Icon = ICONS[item.icon];
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
        active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function NavSections({
  sections,
  activeHref,
  onNavigate,
}: {
  sections: AppShellNavSection[];
  activeHref: string | undefined;
  onNavigate?: () => void;
}): React.ReactElement {
  return (
    <nav className="flex flex-col gap-5">
      {sections.map((section, index) => (
        <div key={section.heading ?? index} className="flex flex-col gap-1">
          {section.heading ? (
            <span className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">{section.heading}</span>
          ) : null}
          {section.items.map((item) => (
            <NavLink key={item.href} item={item} active={item.href === activeHref} onClick={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  );
}

/**
 * The app's persistent navigation chrome (a desktop sidebar, a mobile top bar
 * + slide-down menu + bottom tab bar) — GrowthOS had no shared shell before
 * this: every page was an island with its own ad-hoc list of text links and
 * no way back except the browser's back button. Wraps every org/project page
 * via `app/[locale]/orgs/[orgId]/layout.tsx` and
 * `app/[locale]/orgs/[orgId]/projects/[projectId]/layout.tsx`, so individual
 * pages stay focused on their own content.
 */
export function AppShell({ switchers, sections, mobileTabItems, children }: AppShellProps): React.ReactElement {
  const t = useTranslations('AppShell');
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const allHrefs = [...sections.flatMap((section) => section.items.map((item) => item.href)), ...mobileTabItems.map((item) => item.href)];
  const activeHref = bestMatchingHref(pathname, allHrefs);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-border bg-background/80 p-4 backdrop-blur md:flex">
        {switchers ? <div className="flex flex-col gap-3">{switchers}</div> : null}
        <NavSections sections={sections} activeHref={activeHref} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:hidden">
        <span className="bg-brand-gradient bg-clip-text text-lg font-bold text-transparent">{t('brandName')}</span>
        <button
          type="button"
          onClick={() => setMobileMenuOpen((open) => !open)}
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? t('closeMenu') : t('openMenu')}
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent/10"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </header>

      {/* Mobile slide-down menu */}
      {mobileMenuOpen ? (
        <div className="fixed inset-x-0 top-[57px] z-10 flex max-h-[calc(100vh-57px)] flex-col gap-4 overflow-y-auto border-b border-border bg-background p-4 shadow-soft-lg md:hidden">
          {switchers ? <div className="flex flex-col gap-3">{switchers}</div> : null}
          <NavSections sections={sections} activeHref={activeHref} onNavigate={() => setMobileMenuOpen(false)} />
        </div>
      ) : null}

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
      </div>

      {/* Mobile bottom tab bar */}
      {mobileTabItems.length > 0 ? (
        <nav className="fixed inset-x-0 bottom-0 z-20 flex items-stretch justify-around border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {mobileTabItems.map((item) => {
            const Icon = ICONS[item.icon];
            const active = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
