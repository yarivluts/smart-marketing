import { getTranslations } from 'next-intl/server';
import type { PendingAttachmentDetails } from '@/lib/orgs/queries';
import { DecideAttachmentButton } from './decide-attachment-button';

export interface PendingAttachmentRequestsProps {
  orgId: string;
  requests: PendingAttachmentDetails[];
}

/** The org-resource-owner's approval queue (KAN-27) — only rendered for callers who hold `resources.manage`. */
export async function PendingAttachmentRequests({ orgId, requests }: PendingAttachmentRequestsProps): Promise<React.ReactElement> {
  const t = await getTranslations('ResourceLibrary');

  if (requests.length === 0) {
    return <p className="text-muted-foreground">{t('noPendingRequests')}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {requests.map((request) => (
        <li
          key={request.attachmentId}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-input px-3 py-2 text-sm"
        >
          <span>
            {t('pendingRequestSummary', {
              projectName: request.projectName,
              resourceKind: request.resourceKind,
              resourceName: request.resourceName,
            })}
            {request.scopeSelection.length > 0 ? ` (${request.scopeSelection.join(', ')})` : ''}
          </span>
          <div className="flex items-center gap-2">
            <DecideAttachmentButton orgId={orgId} attachmentId={request.attachmentId} approve />
            <DecideAttachmentButton orgId={orgId} attachmentId={request.attachmentId} approve={false} />
          </div>
        </li>
      ))}
    </ul>
  );
}
