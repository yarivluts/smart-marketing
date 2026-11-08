/**
 * What a person can ask the Growth Pilot to redo for a target they already approved. The pilot owns
 * the work, so a change is a request in plain words for one part - the ads, the landing page or the
 * audience - and the pilot redoes that part and puts it back in front of the person for a decision.
 * The same rule decides which requests the page offers and which the server accepts.
 */

export const GROWTH_CHANGE_AREAS = ['ads', 'landing', 'audience'] as const;
export type GrowthChangeArea = (typeof GROWTH_CHANGE_AREAS)[number];

/** The longest change request a person can send for a target. */
export const GROWTH_TARGET_CHANGE_MAX_CHARS = 1_000;

/** The facts the rule reads, in the shape both the ORM model and the page view can give. */
export interface GrowthChangeFacts {
  status: string;
  briefId: string | null;
  adsStatus: string;
  landingStatus: string;
  audienceStatus: string;
  publishStatus: string;
  /** Areas with a change already being worked on. */
  pendingAreas?: readonly GrowthChangeArea[];
}

export function isGrowthChangeArea(value: unknown): value is GrowthChangeArea {
  return typeof value === 'string' && (GROWTH_CHANGE_AREAS as readonly string[]).includes(value);
}

/**
 * Whether the pilot can redo `area` for this target now:
 * - only for an approved (active) target, and never while a change to the same part is being made;
 * - ads, once they exist (made, approved, declined or failed) - not while they are being made;
 * - the landing page, once one was written, approved, declined or failed;
 * - the audience, once ads exist and it was proposed, approved, declined or failed - also after the
 *   ads were published or turned on: the new audience then comes back as a proposal that, once the
 *   person approves it, updates the live ad set's targeting (see {@link isLiveGrowthPublishStatus}).
 */
export function canChangeGrowthTarget(facts: GrowthChangeFacts, area: GrowthChangeArea): boolean {
  if (facts.status !== 'active') return false;
  if (facts.pendingAreas?.includes(area)) return false;
  if (area === 'ads') return Boolean(facts.briefId) && ['ready', 'approved', 'rejected', 'failed'].includes(facts.adsStatus);
  if (area === 'landing') return ['ready', 'published', 'rejected', 'failed'].includes(facts.landingStatus);
  return Boolean(facts.briefId) && ['ready', 'approved', 'rejected', 'failed'].includes(facts.audienceStatus);
}

/** Whether a target's ads exist on the ad platform: published (still off) or running. A change to them acts on the platform. */
export function isLiveGrowthPublishStatus(status: string | null | undefined): boolean {
  return status === 'published' || status === 'running';
}

/** Every area the pilot can redo for this target now, in a stable order. */
export function growthChangeAreas(facts: GrowthChangeFacts): GrowthChangeArea[] {
  return GROWTH_CHANGE_AREAS.filter((area) => canChangeGrowthTarget(facts, area));
}

/** A request as the person typed it, tidied: one line of words, at most {@link GROWTH_TARGET_CHANGE_MAX_CHARS} characters. */
export function tidyGrowthChangeRequest(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, GROWTH_TARGET_CHANGE_MAX_CHARS);
}
