'use client';

import React, { useState } from 'react';
import { AlertTriangle, Archive, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface DangerZoneCardProps {
  projectName: string;
  onArchive?: () => void;
  onDelete?: () => void;
  className?: string;
}

export function DangerZoneCard({
  projectName,
  onArchive,
  onDelete,
  className = '',
}: DangerZoneCardProps): React.ReactElement {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actionType, setActionType] = useState<'archive' | 'delete'>('archive');
  const [confirmText, setConfirmText] = useState('');

  const handleTriggerAction = (type: 'archive' | 'delete') => {
    setActionType(type);
    setConfirmText('');
    setConfirmOpen(true);
  };

  const handleConfirm = () => {
    if (confirmText !== projectName) return;
    if (actionType === 'archive') {
      onArchive?.();
    } else {
      onDelete?.();
    }
    setConfirmOpen(false);
  };

  return (
    <div
      data-testid="danger-zone-card"
      className={`flex flex-col gap-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-6 shadow-xs ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-base font-bold text-foreground">Danger Zone</h3>
          <p className="text-xs text-muted-foreground">
            Irreversible actions regarding this project and stored campaign tracking data.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-destructive/20 bg-background/80 p-4">
        <div>
          <p className="text-xs font-bold text-foreground">Archive Project</p>
          <p className="text-[11px] text-muted-foreground">
            Temporarily pause all automated synchronizations, webhooks, and metric queries.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          data-testid="archive-project-trigger"
          onClick={() => handleTriggerAction('archive')}
          className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10 shrink-0"
        >
          <Archive className="h-3.5 w-3.5 me-1.5" />
          <span>Archive</span>
        </Button>
      </div>

      {/* Confirmation Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-border/70">
              <h4 className="text-sm font-bold text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span>Confirm {actionType === 'archive' ? 'Archiving' : 'Deletion'}</span>
              </h4>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground mt-3">
              Type <strong className="text-foreground">{projectName}</strong> to confirm this action:
            </p>

            <input
              type="text"
              data-testid="danger-confirm-input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={projectName}
              className="mt-2 h-9 w-full rounded-lg border border-input bg-background px-3 text-xs"
            />

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                type="button"
                data-testid="danger-confirm-submit-btn"
                disabled={confirmText !== projectName}
                onClick={handleConfirm}
                className="text-xs"
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
