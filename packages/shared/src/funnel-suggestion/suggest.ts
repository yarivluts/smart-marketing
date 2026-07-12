import type { FunnelStageKey, FunnelStepSuggestion } from './types';

/** One funnel stage's own keyword lexicon, in the marketing/SaaS funnel order the onboarding wizard proposes steps in (plan `10 §2.6`, `13 §E13.1`). Every keyword is pre-normalized (lowercase, no separators) since it's matched against both a tokenized and a fully-normalized form of the event name — see {@link matchStage}. */
interface FunnelStageDefinition {
  key: Exclude<FunnelStageKey, 'other'>;
  order: number;
  keywords: readonly string[];
}

const FUNNEL_STAGES: readonly FunnelStageDefinition[] = [
  { key: 'awareness', order: 0, keywords: ['view', 'viewed', 'impression', 'visit', 'visited', 'pageview', 'session', 'landing'] },
  { key: 'signup', order: 1, keywords: ['signup', 'signedup', 'register', 'registered', 'registration', 'accountcreated', 'created'] },
  { key: 'activation', order: 2, keywords: ['activate', 'activated', 'activation', 'onboard', 'onboarded', 'onboarding', 'firstuse', 'setupcomplete'] },
  { key: 'trial', order: 3, keywords: ['trial', 'trialstarted', 'trialstart'] },
  { key: 'checkout', order: 4, keywords: ['checkout', 'cart', 'addtocart'] },
  {
    key: 'conversion',
    order: 5,
    keywords: ['purchase', 'purchased', 'paid', 'payment', 'charge', 'charged', 'subscribe', 'subscribed', 'subscription', 'order', 'converted'],
  },
  { key: 'retention', order: 6, keywords: ['renew', 'renewed', 'renewal', 'upgrade', 'upgraded'] },
  { key: 'churn', order: 7, keywords: ['churn', 'churned', 'cancel', 'cancelled', 'canceled', 'downgrade', 'downgraded'] },
];

/** `other`'s own sort order — after every real stage, so an unmatched event never displaces a matched one. */
const OTHER_STAGE_ORDER = FUNNEL_STAGES.length;

function tokenize(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length > 0);
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** A short keyword (e.g. `"order"`) is allowed to match a whole token exactly, but not as a bare substring of the event's normalized name — `"reorder"` shouldn't count as a `checkout` match just because it contains `"order"`. Only keywords at least this long are eligible for the looser substring check. */
const MIN_SUBSTRING_KEYWORD_LENGTH = 6;

/**
 * Scores every {@link FUNNEL_STAGES} entry against one event name and returns the best match. Event
 * names conventionally read `<object>_<action>` (`subscription_cancelled`, `order_placed`) — the
 * *last* token is usually the action that actually determines the funnel stage, so a keyword matching
 * the last token scores highest; a keyword matching any other token scores lower (still enough to win
 * when nothing else matches); a long keyword found anywhere in the event's fully-normalized name
 * (e.g. `"trialstarted"` inside `"trial_started_v2"`, where tokenizing splits it into two separate
 * tokens neither of which alone is a keyword) scores lower still but still counts; no match at all
 * falls back to `other` with zero confidence.
 */
function matchStage(eventName: string): { stageKey: FunnelStageKey; confidence: number } {
  const tokens = tokenize(eventName);
  const tokenSet = new Set(tokens);
  const lastToken = tokens[tokens.length - 1];
  const normalized = normalize(eventName);

  let best: { stageKey: FunnelStageKey; confidence: number } | null = null;
  for (const stage of FUNNEL_STAGES) {
    let score = 0;
    for (const keyword of stage.keywords) {
      if (keyword === lastToken) {
        score = Math.max(score, 1);
      } else if (tokenSet.has(keyword)) {
        score = Math.max(score, 0.85);
      } else if (keyword.length >= MIN_SUBSTRING_KEYWORD_LENGTH && normalized.includes(keyword)) {
        score = Math.max(score, 0.7);
      }
    }
    if (score > 0 && (!best || score > best.confidence)) {
      best = { stageKey: stage.key, confidence: score };
    }
  }

  return best ?? { stageKey: 'other', confidence: 0 };
}

const STAGE_ORDER_BY_KEY: ReadonlyMap<FunnelStageKey, number> = new Map([
  ...FUNNEL_STAGES.map((stage) => [stage.key, stage.order] as const),
  ['other', OTHER_STAGE_ORDER] as const,
]);

/**
 * Proposes an ordered funnel from a project's registered event schema names (KAN-68 AC: "AI proposes
 * funnel/step mapping from discovered data → user confirms"). A deterministic keyword heuristic — a
 * buildable-today stand-in for a real LLM call, the same "provider-agnostic, real backend deferred"
 * posture `suggestFieldMappingRules` (KAN-55) already established for its own proposer. Every event
 * name gets a proposed stage (never dropped, unlike `suggestFieldMappingRules`'s "propose nothing
 * over a wrong guess" posture) — an unrecognized event still needs a slot in the reviewable list so
 * the human can place it manually, since funnel steps are an ordered whole, not independent
 * per-target guesses.
 *
 * Result is sorted by stage order (awareness → ... → churn → other), ties broken alphabetically by
 * event name, and `order` is reassigned 0-based over that final sort — the caller renders steps
 * top-to-bottom in exactly this order.
 */
export function proposeFunnelSteps(eventSchemaNames: readonly string[]): FunnelStepSuggestion[] {
  const matched = eventSchemaNames.map((eventSchemaName) => {
    const { stageKey, confidence } = matchStage(eventSchemaName);
    return { eventSchemaName, stageKey, confidence };
  });

  const sorted = [...matched].sort((a, b) => {
    const orderA = STAGE_ORDER_BY_KEY.get(a.stageKey) ?? OTHER_STAGE_ORDER;
    const orderB = STAGE_ORDER_BY_KEY.get(b.stageKey) ?? OTHER_STAGE_ORDER;
    return orderA !== orderB ? orderA - orderB : a.eventSchemaName.localeCompare(b.eventSchemaName);
  });

  return sorted.map((entry, index) => ({ ...entry, order: index }));
}
