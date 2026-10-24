/**
 * Maps a failed quick-execute response (pause/resume or daily budget) to a Campaigns translation
 * key, so people read a sentence that says what to do next instead of the server's English text or
 * a raw code like `insufficient_write_tier`.
 */
type QuickActionErrorBody = {
  error?: unknown;
  message?: unknown;
  violations?: ReadonlyArray<{ type?: unknown }>;
};

const GUARDRAIL_KEYS: Record<string, string> = {
  max_daily_change_pct: 'guardrailMaxChange',
  spend_ceiling: 'guardrailSpendCeiling',
  protected_target: 'guardrailProtected',
  outside_allowed_hours: 'guardrailOutsideHours',
  blast_radius: 'guardrailDailyLimit',
  automation_paused: 'guardrailPaused',
  insufficient_write_tier: 'guardrailViewOnly',
};

const ERROR_CODE_KEYS: Record<string, string> = {
  kill_switch_engaged: 'guardrailPaused',
  insufficient_write_tier: 'guardrailViewOnly',
  google_ads_plugin_not_installed: 'quickActionNotConnected',
  google_ads_credential_not_configured: 'quickActionNotConnected',
  meta_plugin_not_installed: 'quickActionNotConnected',
  meta_ads_credential_not_configured: 'quickActionNotConnected',
};

export function quickActionErrorKey(status: number, body: QuickActionErrorBody | null): string {
  if (status === 403) return 'quickActionPermissionDenied';
  if (status === 422) {
    const type = body?.violations?.[0]?.type;
    return (typeof type === 'string' && GUARDRAIL_KEYS[type]) || 'guardrailGeneric';
  }
  const code = body?.error;
  return (typeof code === 'string' && ERROR_CODE_KEYS[code]) || 'quickActionError';
}
