'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import {
  Search,
  Sparkles,
  Megaphone,
  Target,
  Bot,
  Settings,
  TrendingUp,
  Zap,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MarketingCommandBarProps {
  orgId: string;
  projectId: string;
  onOpenCopilotWithQuery?: (query: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export function MarketingCommandBar({
  orgId,
  projectId,
  onOpenCopilotWithQuery,
  isOpen: controlledIsOpen,
  onClose: controlledOnClose,
}: MarketingCommandBarProps): React.ReactElement | null {
  const t = useTranslations('CommandBar');
  const locale = useLocale();
  const router = useRouter();

  const [uncontrolledIsOpen, setUncontrolledIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const isControlled = typeof controlledIsOpen === 'boolean';
  const open = isControlled ? controlledIsOpen : uncontrolledIsOpen;

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  const close = useCallback(() => {
    if (isControlled && controlledOnClose) {
      controlledOnClose();
    } else {
      setUncontrolledIsOpen(false);
    }
    setQuery('');
    setSelectedIndex(0);
  }, [isControlled, controlledOnClose]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (!isControlled) {
          setUncontrolledIsOpen((prev) => !prev);
        }
      } else if (event.key === 'Escape' && open) {
        close();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [close, open, isControlled]);

  const base = `/orgs/${orgId}/projects/${projectId}`;

  const commandItems = [
    // Fast AI Action Triggers
    {
      id: 'ai-rebalance',
      group: 'actions',
      label: t('actionRebalance'),
      icon: TrendingUp,
      action: () => {
        close();
        if (onOpenCopilotWithQuery) {
          onOpenCopilotWithQuery(locale === 'he' ? 'העבר תקציב מגוגל למטא' : 'Reallocate Google to Meta budget');
        } else {
          router.push(`${base}/automation`);
        }
      },
    },
    {
      id: 'ai-retarget-draft',
      group: 'actions',
      label: t('actionRetargetDraft'),
      icon: Sparkles,
      action: () => {
        close();
        if (onOpenCopilotWithQuery) {
          onOpenCopilotWithQuery(locale === 'he' ? 'ייעל נטישה בשלב 2' : 'Optimize drop-off at stage 2');
        } else {
          router.push(`${base}/funnel`);
        }
      },
    },
    {
      id: 'ai-meta-budget',
      group: 'actions',
      label: t('actionIncreaseMeta'),
      icon: Zap,
      action: () => {
        close();
        if (onOpenCopilotWithQuery) {
          onOpenCopilotWithQuery(locale === 'he' ? 'הגדל תקציב ל-250$ ב-Meta' : 'Increase budget for retargeting campaign to $250');
        } else {
          router.push(`${base}/campaigns`);
        }
      },
    },
    // Primary Module Navigations
    {
      id: 'nav-ads',
      group: 'navigation',
      label: t('navAds'),
      icon: Megaphone,
      action: () => {
        close();
        router.push(`${base}/campaigns`);
      },
    },
    {
      id: 'nav-funnel',
      group: 'navigation',
      label: t('navFunnel'),
      icon: Target,
      action: () => {
        close();
        router.push(`${base}/funnel`);
      },
    },
    {
      id: 'nav-automation',
      group: 'navigation',
      label: t('navAutomation'),
      icon: Bot,
      action: () => {
        close();
        router.push(`${base}/automation`);
      },
    },
    {
      id: 'nav-settings',
      group: 'navigation',
      label: t('navSettings'),
      icon: Settings,
      action: () => {
        close();
        router.push(`/orgs/${orgId}/settings`);
      },
    },
  ];

  const filteredItems = commandItems.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase()),
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filteredItems.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % (filteredItems.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
      }
    }
  };

  if (!open) return null;

  return (
    <div
      data-testid="command-bar-dialog"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[15vh] backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        onKeyDown={handleKeyDown}
      >
        {/* Search Header */}
        <div className="flex items-center border-b border-border px-3.5 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            data-testid="command-bar-input"
            dir="auto"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder={t('inputPlaceholder')}
            className="flex-1 bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={close}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results List */}
        <div data-testid="command-bar-list" className="max-h-80 overflow-y-auto p-2">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {t('noResults')}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredItems.map((item, index) => {
                const Icon = item.icon;
                const isSelected = index === selectedIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`command-item-${item.id}`}
                    onClick={() => item.action()}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-colors cursor-pointer',
                      isSelected
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : 'text-foreground hover:bg-muted/70',
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={cn('h-4 w-4', isSelected ? 'text-primary-foreground' : 'text-primary')} />
                      <span>{item.label}</span>
                    </div>

                    <span
                      className={cn(
                        'text-[10px] uppercase font-bold tracking-wider rounded px-1.5 py-0.5',
                        isSelected
                          ? 'bg-primary-foreground/20 text-primary-foreground'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {item.group === 'actions' ? t('badgeAction') : t('badgeNav')}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between border-t border-border bg-muted/40 px-3.5 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px]">{'↑↓'}</kbd> {t('shortcutNavigate')}
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px]">{'↵'}</kbd> {t('shortcutSelect')}
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px]">{'ESC'}</kbd> {t('shortcutClose')}
          </span>
        </div>
      </div>
    </div>
  );
}
