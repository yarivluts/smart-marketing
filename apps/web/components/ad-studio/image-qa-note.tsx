'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { AdStudioImageQaView } from '@/lib/ad-studio/view';

/**
 * The AI check of one image, under it: a quiet line when it passed (saying when it took re-renders),
 * the problems when it did not - a headline the code found misspelled is worded here, with what the
 * image actually reads. Nothing for images made before the check, or when it was off.
 */
export function ImageQaNote({ qa }: { qa: AdStudioImageQaView | null }): React.ReactElement | null {
  const t = useTranslations('AdStudio.images.qa');
  if (!qa || qa.status === 'skipped') return null;
  if (qa.status === 'error') return <p className="text-[11px] text-muted-foreground">{t('error')}</p>;
  if (qa.status === 'passed') {
    return (
      <p className="inline-flex items-center gap-1 text-[11px] text-success" data-testid="ad-studio-image-qa-passed">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {qa.renders > 1 ? t('passedRetried', { renders: qa.renders }) : t('passed')}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-warning/40 bg-warning/10 p-2 text-[11px]" role="status" data-testid="ad-studio-image-qa-issues">
      <p className="inline-flex items-center gap-1 font-semibold">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
        {t('issues')}
      </p>
      <ul className="flex list-disc flex-col gap-0.5 ps-4">
        {qa.issues.map((issue, index) => (
          <li key={index} className={issue.severity === 'major' ? 'font-medium' : 'text-muted-foreground'}>
            {issue.code === 'headline_mismatch' ? (
              issue.detail ? (
                <>
                  {t('headlineMismatch')} <bdi dir="auto">&quot;{issue.detail}&quot;</bdi>
                </>
              ) : (
                t('headlineMissing')
              )
            ) : (
              <bdi dir="auto">{issue.detail}</bdi>
            )}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">{t('issuesHint')}</p>
    </div>
  );
}
