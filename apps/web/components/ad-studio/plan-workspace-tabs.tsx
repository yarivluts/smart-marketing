'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Compass, Film, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';

type PlanTabId = 'strategy' | 'script' | 'ideas';

/**
 * Organizes Step 2 (Plan) into three focused views — Strategy & Research, Video Script, and
 * Image Ideas — instead of stacking seven long panels vertically on mobile and desktop.
 */
export function PlanWorkspaceTabs({
  scriptCount,
  ideasCount,
  strategySlot,
  scriptSlot,
  ideasSlot,
}: {
  scriptCount: number;
  ideasCount: number;
  strategySlot: React.ReactNode;
  scriptSlot: React.ReactNode;
  ideasSlot: React.ReactNode;
}): React.ReactElement {
  const t = useTranslations('AdStudio.stepWorkspace');
  const [activeTab, setActiveTab] = React.useState<PlanTabId>('strategy');

  const tabs: Array<{ id: PlanTabId; label: string; icon: typeof Compass }> = [
    { id: 'strategy', label: t('planTabStrategy'), icon: Compass },
    { id: 'script', label: t('planTabScript', { count: scriptCount }), icon: Film },
    { id: 'ideas', label: t('planTabIdeas', { count: ideasCount }), icon: Lightbulb },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="ad-studio-plan-tabs">
      <div
        role="tablist"
        aria-label={t('planTabsLabel')}
        className="flex min-w-0 items-center gap-1.5 overflow-x-auto rounded-full border border-pp-outline-variant/45 bg-card p-1.5 shadow-pp-candy [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`ad-studio-plan-tab-${tab.id}`}
              className={cn(
                'inline-flex shrink-0 flex-1 items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-all sm:text-sm',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-pp-surface-container-low hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'strategy' ? (
        <div role="tabpanel" className="flex min-w-0 flex-col gap-4">
          {strategySlot}
        </div>
      ) : null}

      {activeTab === 'script' ? (
        <div role="tabpanel" className="min-w-0">
          {scriptSlot}
        </div>
      ) : null}

      {activeTab === 'ideas' ? (
        <div role="tabpanel" className="min-w-0">
          {ideasSlot}
        </div>
      ) : null}
    </div>
  );
}
