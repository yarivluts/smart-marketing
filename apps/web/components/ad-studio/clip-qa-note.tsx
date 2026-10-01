'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, Loader2, ShieldQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdStudioClipView } from '@/lib/ad-studio/view';

type Qa = NonNullable<AdStudioClipView['qa']>;
type Issue = Qa['issues'][number];

function IssueLine({ issue }: { issue: Issue }): React.ReactElement {
  const t = useTranslations('AdStudio.video.qa');
  return (
    <li className="flex gap-2">
      <span className="shrink-0 font-medium">{t(`kind.${issue.kind}`)}</span>
      <span dir="auto" className="min-w-0">
        {issue.detail}
        {issue.atSeconds !== null ? <span className="ms-1 text-muted-foreground tabular-nums">{t('at', { seconds: issue.atSeconds })}</span> : null}
      </span>
    </li>
  );
}

/**
 * What the AI quality check found in the clip a scene shows: still checking, passed (with any small
 * notes), problems to fix (re-render or edit the scene), or that the check was off or could not run.
 * What the reviewer heard is one click away, to compare with the narration.
 */
export function ClipQaNote({ clip }: { clip: AdStudioClipView }): React.ReactElement | null {
  const t = useTranslations('AdStudio.video.qa');
  if (clip.status !== 'ready') return null;
  const qa = clip.qa;
  if (!qa) {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="ad-studio-clip-qa" data-qa="pending">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        {t('checking')}
      </p>
    );
  }
  if (qa.status === 'skipped' || qa.status === 'error') {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="ad-studio-clip-qa" data-qa={qa.status}>
        <ShieldQuestion className="h-3.5 w-3.5" aria-hidden="true" />
        {t(qa.status)}
      </p>
    );
  }
  const major = qa.issues.filter((issue) => issue.severity === 'major');
  const minor = qa.issues.filter((issue) => issue.severity === 'minor');
  const failed = qa.status === 'issues';
  return (
    <div
      className={cn('flex flex-col gap-1.5 rounded-xl border px-3 py-2 text-xs', failed ? 'border-destructive/40 bg-destructive/5' : 'border-success/30 bg-success/5')}
      data-testid="ad-studio-clip-qa"
      data-qa={qa.status}
    >
      <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', failed ? 'text-destructive' : 'text-success')}>
        {failed ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
        {failed ? t('issuesTitle', { count: major.length }) : t('passed')}
      </span>
      {major.length ? (
        <ul className="flex flex-col gap-1 text-foreground">
          {major.map((issue, index) => (
            <IssueLine key={`major-${index}`} issue={issue} />
          ))}
        </ul>
      ) : null}
      {failed ? <span className="text-muted-foreground">{t('fixHint')}</span> : null}
      {minor.length ? (
        <details>
          <summary className="cursor-pointer text-muted-foreground">{t('minorCount', { count: minor.length })}</summary>
          <ul className="mt-1 flex flex-col gap-1">
            {minor.map((issue, index) => (
              <IssueLine key={`minor-${index}`} issue={issue} />
            ))}
          </ul>
        </details>
      ) : null}
      {qa.transcript ? (
        <details>
          <summary className="cursor-pointer text-muted-foreground">{t('heard')}</summary>
          <p className="mt-1 text-foreground" dir="auto">
            {qa.transcript}
          </p>
        </details>
      ) : null}
    </div>
  );
}
