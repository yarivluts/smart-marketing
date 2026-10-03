'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { Sparkles, Film, Bot, Video, ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PpPill } from '@/components/pastel/primitives';

interface AdStudioNavHeaderProps {
  orgId: string;
  projectId: string;
}

export function AdStudioNavHeader({ orgId, projectId }: AdStudioNavHeaderProps): React.ReactElement {
  const t = useTranslations('AdStudioPage');
  const pathname = usePathname();
  const basePath = `/orgs/${orgId}/projects/${projectId}/ad-studio`;

  const tabs = [
    {
      id: 'hub',
      label: t('tabOverview'),
      href: basePath,
      icon: Sparkles,
      exact: true,
    },
    {
      id: 'storyboard',
      label: t('tabStoryboard'),
      href: `${basePath}/storyboard`,
      icon: Film,
      exact: false,
    },
    {
      id: 'autopilot',
      label: t('tabAutopilot'),
      href: `${basePath}/autopilot`,
      icon: Bot,
      exact: false,
    },
    {
      id: 'video-export',
      label: t('tabVideoExport'),
      href: `${basePath}/video-export`,
      icon: Video,
      exact: false,
    },
  ];

  const isActive = (href: string, exact: boolean) => {
    if (exact) {
      return pathname === href || pathname === `${href}/`;
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="flex flex-col gap-4 border-b border-pp-outline-variant/30 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/orgs/${orgId}/projects/${projectId}/campaigns`}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-pp-surface-container text-pp-on-surface-variant transition-colors hover:bg-pp-surface-container-high hover:text-pp-on-surface"
            title={t('btnBackToStudio')}
            aria-label={t('btnBackToStudio')}
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <PpPill accent="primary" dot>
                {t('badge')}
              </PpPill>
            </div>
            <h1 className="mt-1 font-pp-display text-pp-headline-xl-mobile text-pp-on-surface md:text-pp-headline-xl">
              {t('title')}
            </h1>
          </div>
        </div>
      </div>

      <nav aria-label="Ad Studio sub navigation" className="flex flex-wrap items-center gap-2">
        {tabs.map((tab) => {
          const active = isActive(tab.href, tab.exact);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`flex items-center gap-2 rounded-full px-4 py-2 font-pp-body text-pp-label-md transition-all ${
                active
                  ? 'bg-pp-primary text-pp-on-primary shadow-pp-candy'
                  : 'bg-pp-surface-container text-pp-on-surface-variant hover:bg-pp-surface-container-high hover:text-pp-on-surface'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
