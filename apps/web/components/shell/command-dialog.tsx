'use client';

import * as React from 'react';
import {
  Search,
  Megaphone,
  Target,
  Bot,
  Tv,
  Settings,
  Users,
  Receipt,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface CommandItem {
  id: string;
  title: string;
  description: string;
  category: 'Core' | 'Analytics' | 'AI & Automation' | 'Operations';
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

export interface CommandDialogProps {
  orgId?: string;
  projectId?: string;
  customItems?: CommandItem[];
}

export function CommandDialog({
  orgId,
  projectId,
  customItems,
}: CommandDialogProps): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);

  const base = orgId && projectId ? `/orgs/${orgId}/projects/${projectId}` : '';

  const defaultItems = React.useMemo<CommandItem[]>(
    () => [
      {
        id: 'campaigns',
        title: 'Ads & Performance Cockpit',
        description: 'Blended ROAS, Meta feed & Google RSA creatives, active budget controls',
        category: 'Core',
        href: base ? `${base}/campaigns` : '/campaigns',
        icon: Megaphone,
        badge: 'Live',
      },
      {
        id: 'funnel',
        title: 'Conversion Funnel Flow',
        description: 'Stage-by-stage conversion tracking with drop-off stream analytics',
        category: 'Analytics',
        href: base ? `${base}/funnel` : '/funnel',
        icon: Target,
      },
      {
        id: 'goals',
        title: 'Dynamic Goal Thermometers',
        description: 'Quarterly growth targets, pace projections, and milestone trackers',
        category: 'Analytics',
        href: base ? `${base}/goals` : '/goals',
        icon: TrendingUp,
      },
      {
        id: 'automation',
        title: 'AI Copilot & Automation Hub',
        description: 'Conversational recommendations, 1-click execution & audit trail',
        category: 'AI & Automation',
        href: base ? `${base}/automation` : '/automation',
        icon: Bot,
        badge: 'AI Powered',
      },
      {
        id: 'tv',
        title: 'TV Billboard Display Mode',
        description: 'Live broadcast dashboard with war room win celebrations',
        category: 'Operations',
        href: base ? `${base}/tv` : '/tv',
        icon: Tv,
      },
      {
        id: 'billing-ops-feed',
        title: 'Billing & Operations Feed',
        description: 'Real-time billing event stream, invoice history, and quota monitoring',
        category: 'Operations',
        href: base ? `${base}/billing-ops-feed` : '/billing-ops-feed',
        icon: Receipt,
      },
      {
        id: 'members',
        title: 'Team & Member Roles',
        description: 'Manage organization permissions, invitations, and access keys',
        category: 'Operations',
        href: orgId ? `/orgs/${orgId}/members` : '/members',
        icon: Users,
      },
      {
        id: 'settings',
        title: 'Workspace Settings',
        description: 'Configure integrations, webhooks, tracking pixels, and security',
        category: 'Operations',
        href: base ? `${base}/settings` : '/settings',
        icon: Settings,
      },
    ],
    [base, orgId],
  );

  const allItems = customItems ?? defaultItems;

  const filteredItems = React.useMemo(() => {
    if (!query.trim()) return allItems;
    const lower = query.toLowerCase();
    return allItems.filter(
      (item) =>
        item.title.toLowerCase().includes(lower) ||
        item.description.toLowerCase().includes(lower) ||
        item.category.toLowerCase().includes(lower),
    );
  }, [allItems, query]);

  React.useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredItems.length, query]);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((prev) => !prev);
      } else if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  function handleSelect(item: CommandItem) {
    setOpen(false);
    setQuery('');
    router.push(item.href);
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, Math.max(filteredItems.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = filteredItems[highlightedIndex];
      if (selected) {
        handleSelect(selected);
      }
    }
  }

  const activeItem = filteredItems[highlightedIndex];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open command search"
        className="flex w-full items-center gap-2.5 rounded-xl border border-border/80 bg-background/80 px-3.5 py-2 text-xs font-medium text-muted-foreground shadow-soft transition-all hover:bg-muted/60 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1 truncate text-start">Jump to any module or page...</span>
        <kbd className="hidden shrink-0 rounded-md border border-border bg-muted/80 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground sm:inline-block">
          ⌘K
        </kbd>
      </button>

      {open ? (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 p-4 pt-[10vh] backdrop-blur-md animate-fade-in"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Command search dialog"
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border/80 bg-card shadow-soft-xl animate-zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-border/80 px-4 py-3.5">
              <Search className="h-5 w-5 shrink-0 text-primary" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Type a command, page name, or keyword..."
                aria-label="Search command dialog"
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <Badge variant="secondary" size="sm" className="hidden sm:inline-flex">
                ESC to exit
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 min-h-[280px] max-h-[400px]">
              {/* Results List */}
              <div className="md:col-span-3 overflow-y-auto border-e border-border/60 p-2 space-y-1">
                {filteredItems.length === 0 ? (
                  <div className="py-12 text-center text-xs text-muted-foreground">
                    No matching commands found for &ldquo;{query}&rdquo;
                  </div>
                ) : (
                  filteredItems.map((item, index) => {
                    const isSelected = index === highlightedIndex;
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.id}
                        role="option"
                        aria-selected={isSelected}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        onClick={() => handleSelect(item)}
                        className={cn(
                          'flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-xs transition-colors',
                          isSelected
                            ? 'bg-primary/10 text-primary font-medium shadow-soft'
                            : 'text-foreground hover:bg-muted/70',
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={cn(
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                              isSelected ? 'bg-primary text-white' : 'bg-muted text-muted-foreground',
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="truncate">
                            <span className="block font-semibold truncate">{item.title}</span>
                            <span className="block text-[10px] text-muted-foreground truncate">{item.category}</span>
                          </div>
                        </div>
                        {item.badge ? (
                          <Badge variant="success" size="sm" className="text-[10px] py-0 px-1.5 shrink-0">
                            {item.badge}
                          </Badge>
                        ) : (
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 rtl:rotate-180 shrink-0" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Instant Visual Preview Pane */}
              <div className="hidden md:flex md:col-span-2 flex-col justify-between p-4 bg-muted/20">
                {activeItem ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <activeItem.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="block text-xs font-bold text-foreground leading-tight">
                          {activeItem.title}
                        </span>
                        <Badge variant="secondary" size="sm" className="mt-0.5 text-[9px] py-0">
                          {activeItem.category}
                        </Badge>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {activeItem.description}
                    </p>

                    <div className="rounded-lg border border-border/60 bg-card p-2 text-[11px] text-muted-foreground">
                      <span className="block font-medium text-foreground mb-0.5">Route:</span>
                      <code className="text-[10px] text-primary">{activeItem.href}</code>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    Select an item to view preview
                  </div>
                )}

                <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>↵ to navigate</span>
                  <span>↑↓ to navigate</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
