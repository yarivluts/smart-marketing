'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { Sparkles, Film, Bot, Video, ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

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
    <div className="flex flex-col gap-4 border-b border-[#ECE8F6] pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/orgs/${orgId}/projects/${projectId}/campaigns`}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ECE8F6] text-[#6B6A78] transition-colors hover:bg-[#EBE9FD] hover:text-[#7064F4]"
            title={t('btnBackToStudio')}
            aria-label={t('btnBackToStudio')}
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EBE9FD] px-2.5 py-0.5 text-xs font-semibold text-[#5243D5]">
                <Sparkles className="h-3 w-3 text-[#7064F4]" />
                {t('badge')}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#181820]">
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
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                active
                  ? 'bg-[#7064F4] text-white shadow-sm'
                  : 'bg-[#ECE8F6] text-[#6B6A78] hover:bg-[#EBE9FD] hover:text-[#5243D5]'
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
