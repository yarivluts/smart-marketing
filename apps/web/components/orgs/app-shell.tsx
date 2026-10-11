'use client';

import { useState, type ReactNode } from 'react';
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
  Megaphone,
  LayoutGrid,
  Menu,
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
  X,
  type LucideIcon,
  Clapperboard,
  Network,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/shell/language-switcher';
import { UserMenu } from './user-menu';
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
  Clapperboard,
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
  /** KAN-85 global omnisearch trigger — rendered below `switchers`, above the nav sections, in the sidebar and mobile menu. Project-scoped, so only `ProjectLayout` passes it; `OrgShell` (org-only pages) omits it. */
  omniSearch?: ReactNode;
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
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-pp-sm rounded-pp-lg px-pp-md py-pp-sm text-pp-label-md transition-colors',
        active
          ? 'bg-pp-primary-fixed font-semibold text-primary'
          : 'text-pp-on-surface-variant hover:bg-pp-surface-container-high hover:text-pp-on-surface',
      )}
    >
      <Icon className={cn('h-5 w-5 shrink-0', active ? 'text-pp-primary' : 'text-pp-on-surface-variant')} aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/** The GrowthOS mark: the violet tile and wordmark of the Pastel Pulse header. */
function Brand({ name }: { name: string }): React.ReactElement {
  return (
    <span className="flex items-center gap-pp-sm">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-pp-primary text-pp-on-primary shadow-sm shadow-pp-primary/30">
        <Network className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="font-pp-display text-pp-headline-md font-bold tracking-tight text-pp-primary">{name}</span>
    </span>
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
  // The same href can appear twice (a primary module and its restored per-feature link, e.g. the
  // funnel): only the first occurrence is marked current, so the sidebar never shows two active pills.
  const activeItem = sections.flatMap((section) => section.items).find((item) => item.href === activeHref);
  return (
    <nav className="flex flex-col gap-pp-md">
      {sections.map((section, index) => (
        <div key={section.heading ?? index} className="flex flex-col gap-1">
          {section.heading ? (
            <span className="px-pp-md py-1 text-pp-label-sm uppercase tracking-wider text-pp-outline">{section.heading}</span>
          ) : index > 0 ? (
            <div className="mx-pp-md mb-1 border-b border-pp-outline-variant/30" aria-hidden="true" />
          ) : null}
          {section.items.map((item) => (
            <NavLink key={item.href} item={item} active={item === activeItem} onClick={onNavigate} />
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
export function AppShell({ switchers, omniSearch, sections, mobileTabItems, children }: AppShellProps): React.ReactElement {
  const t = useTranslations('AppShell');
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const allHrefs = [...sections.flatMap((section) => section.items.map((item) => item.href)), ...mobileTabItems.map((item) => item.href)];
  const activeHref = bestMatchingHref(pathname, allHrefs);

  return (
    <div className="flex min-h-screen flex-col bg-pp-surface-container-low text-pp-on-surface">
      {/* Top bar: brand, omnisearch and language on desktop; brand and the menu button on mobile */}
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-pp-md border-b border-pp-outline-variant/30 bg-pp-surface-container-lowest/95 px-pp-md backdrop-blur lg:px-pp-lg">
        <Link href="/" className="shrink-0">
          <Brand name={t('brandName')} />
        </Link>
        {omniSearch ? <div className="mx-2 hidden max-w-md flex-1 md:block">{omniSearch}</div> : null}
        <div className="flex shrink-0 items-center gap-pp-sm">
          <LanguageSwitcher compact className="hidden sm:flex" />
          <UserMenu />
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? t('closeMenu') : t('openMenu')}
            className="flex h-10 w-10 items-center justify-center rounded-full text-pp-on-surface-variant hover:bg-pp-surface-container-high md:hidden"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-72 shrink-0 flex-col gap-pp-md overflow-y-auto bg-pp-surface-container-lowest p-pp-md shadow-sm md:flex">
          {switchers ? (
            <div className="flex flex-col gap-3 rounded-pp border border-pp-outline-variant/40 bg-pp-surface-container-lowest p-pp-sm shadow-pp-candy">
              {switchers}
            </div>
          ) : null}
          <NavSections sections={sections} activeHref={activeHref} />
        </aside>

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex-1 pb-pp-dock md:pb-0">{children}</main>
        </div>
      </div>

      {/* Mobile slide-down menu (fixed under the top bar; after the sidebar in document order) */}
      {mobileMenuOpen ? (
        <div className="fixed inset-x-0 top-16 z-20 flex max-h-[calc(100vh-4rem)] flex-col gap-pp-md overflow-y-auto border-b border-pp-outline-variant/30 bg-pp-surface-container-lowest p-pp-md shadow-pp-candy md:hidden">
          {switchers ? <div className="flex flex-col gap-3 rounded-pp bg-pp-surface-container-low p-pp-sm">{switchers}</div> : null}
          {omniSearch}
          <LanguageSwitcher compact className="sm:hidden" />
          <NavSections sections={sections} activeHref={activeHref} onNavigate={() => setMobileMenuOpen(false)} />
        </div>
      ) : null}

      {/* Mobile bottom tab bar */}
      {mobileTabItems.length > 0 ? (
        <nav className="fixed inset-x-3 bottom-3 z-20 flex items-stretch justify-around rounded-pp-lg bg-pp-surface-container-lowest/95 pb-[env(safe-area-inset-bottom)] shadow-pp-dock backdrop-blur md:hidden">
          {mobileTabItems.map((item) => {
            const Icon = ICONS[item.icon];
            const active = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-1 flex-col items-center gap-0.5 rounded-pp-lg py-2 text-[11px] font-semibold transition-colors',
                  active ? 'text-primary' : 'text-pp-on-surface-variant hover:text-pp-on-surface',
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
