/**
 * Shared across `campaign-draft.ts` (Google Ads) and `meta-campaign-draft.ts`
 * (Meta) so neither validator module needs to import the other — both
 * `validateCampaignDraft` (the platform dispatcher) and `validateMetaCampaignDraft`
 * throw this same error type, collecting every violation before throwing
 * once (KAN-72/KAN-73's shared "report every reason at once" posture).
 */
export class InvalidCampaignDraftError extends Error {
  constructor(public readonly reasons: readonly string[]) {
    super(`Invalid campaign draft: ${reasons.join('; ')}`);
    this.name = 'InvalidCampaignDraftError';
  }
}
