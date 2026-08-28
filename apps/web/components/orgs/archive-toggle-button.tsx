'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface ArchiveToggleButtonProps {
  /** DELETE endpoint that archives the resource. */
  archivePath: string;
  /** POST endpoint that unarchives the resource. */
  unarchivePath: string;
  archived: boolean;
  archiveLabel: string;
  unarchiveLabel: string;
  errorLabel: string;
}

/**
 * A single archive/unarchive toggle, shared across every Org Resource
 * Library kind (KAN-129) — credentials, templates, and people all need the
 * exact same "retire it, or bring it back" control, unlike each kind's own
 * `Edit*Form`/`Create*Form` (which stay per-kind since their field sets
 * differ). Mirrors `DisableHookEndpointButton`/`EnableHookEndpointButton`'s
 * DELETE-to-disable / POST-to-enable convention, collapsed into one
 * generalized component instead of six near-identical copies.
 */
export function ArchiveToggleButton({
  archivePath,
  unarchivePath,
  archived,
  archiveLabel,
  unarchiveLabel,
  errorLabel,
}: ArchiveToggleButtonProps): React.ReactElement {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick(): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(archived ? unarchivePath : archivePath, { method: archived ? 'POST' : 'DELETE' });
      if (!response.ok) {
        setError(true);
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant={archived ? 'outline' : 'destructive'} size="sm" onClick={handleClick} disabled={submitting}>
        {archived ? unarchiveLabel : archiveLabel}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {errorLabel}
        </p>
      ) : null}
    </div>
  );
}
