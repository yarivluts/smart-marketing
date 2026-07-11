import type { WinEventModel, WinRuleModel } from '@growthos/firebase-orm-models';
import type { WinRuleFilter } from '@growthos/shared';

/** A win rule's own admin-list/edit-form shape — never sends the full `@arbel/firebase-orm` model instance to a client component. */
export interface WinRuleSummaryView {
  id: string;
  name: string;
  schemaName: string;
  filters: WinRuleFilter[];
  active: boolean;
  createdAt: string;
}

export function toWinRuleSummaryView(rule: WinRuleModel): WinRuleSummaryView {
  return {
    id: rule.id,
    name: rule.name,
    schemaName: rule.schema_name,
    filters: rule.filters,
    active: rule.active,
    createdAt: rule.created_at,
  };
}

/** One fired win, as rendered in the live feed (and the feed's SSE push payload — see `feed/route.ts`). */
export interface WinEventFeedItem {
  id: string;
  winRuleName: string;
  schemaName: string;
  clientId: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
}

export function toWinEventFeedItem(event: WinEventModel): WinEventFeedItem {
  return {
    id: event.id,
    winRuleName: event.win_rule_name,
    schemaName: event.schema_name,
    clientId: event.client_id,
    payload: event.payload,
    occurredAt: event.occurred_at,
    createdAt: event.created_at,
  };
}
