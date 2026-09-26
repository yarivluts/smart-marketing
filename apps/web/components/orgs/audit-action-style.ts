import { KeyRound, Pencil, PlayCircle, PlusCircle, RefreshCw, Sparkles, Trash2, type LucideIcon } from 'lucide-react';
import type { TimelineTone } from '@/components/viz/timeline';
import type { AuditActionCategory } from '@/lib/orgs/workspace-view';

/** The icon an audit-log action is drawn with on a timeline, by the kind of change it records. */
export const AUDIT_CATEGORY_ICONS: Record<AuditActionCategory, LucideIcon> = {
  create: PlusCircle,
  update: Pencil,
  delete: Trash2,
  access: KeyRound,
  data: RefreshCw,
  run: PlayCircle,
  other: Sparkles,
};

export const AUDIT_CATEGORY_TONES: Record<AuditActionCategory, TimelineTone> = {
  create: 'success',
  update: 'info',
  delete: 'destructive',
  access: 'warning',
  data: 'primary',
  run: 'primary',
  other: 'muted',
};
