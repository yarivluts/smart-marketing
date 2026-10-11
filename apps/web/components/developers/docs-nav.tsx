'use client';

import { BookOpen, Bot, Braces, FlaskConical, Globe, Rocket, Server, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { DEVELOPER_GUIDES, developerGuideHref } from '@/lib/developers/guides';
import { cn } from '@/lib/utils';

const ICONS: Record<(typeof DEVELOPER_GUIDES)[number]['icon'], LucideIcon> = {
  BookOpen,
  Rocket,
  Globe,
  Server,
  Braces,
  Bot,
  FlaskConical,
};

/** The guides list: a sticky sidebar on desktop, a horizontally scrolling pill row on a phone. */
export function DocsNav({ variant }: { variant: 'sidebar' | 'pills' }): React.ReactElement {
  const t = useTranslations('Developers.nav');
  const pathname = usePathname();
  return (
    <nav
      aria-label={t('label')}
      className={cn(variant === 'sidebar' ? 'flex flex-col gap-1' : '-mx-4 flex gap-2 overflow-x-auto px-4 pb-1')}
    >
      {DEVELOPER_GUIDES.map((guide) => {
        const href = developerGuideHref(guide);
        const active = pathname === href;
        const Icon = ICONS[guide.icon];
        return (
          <Link
            key={guide.key}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-pp-sm whitespace-nowrap text-pp-label-md transition-colors',
              variant === 'sidebar' ? 'rounded-pp-lg px-pp-md py-pp-sm' : 'shrink-0 rounded-full px-3 py-1.5',
              active
                ? 'bg-pp-primary-fixed font-semibold text-primary'
                : 'text-pp-on-surface-variant hover:bg-pp-surface-container-high hover:text-pp-on-surface',
            )}
          >
            <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-pp-primary' : '')} aria-hidden="true" />
            {t(guide.key)}
          </Link>
        );
      })}
    </nav>
  );
}
