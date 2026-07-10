import type { HookDeliveryStatus, HookSignatureMode } from '@growthos/firebase-orm-models';

/** The `Hooks` translation key for one endpoint's signature mode label. next-intl namespace keys can't contain `.`, so this can't be built as a template string (`signatureMode.${mode}`) — a lookup table instead. */
const SIGNATURE_MODE_LABEL_KEYS: Record<HookSignatureMode, 'signatureModeNone' | 'signatureModeHmacSha256'> = {
  none: 'signatureModeNone',
  hmac_sha256: 'signatureModeHmacSha256',
};

export function hookSignatureModeLabelKey(mode: HookSignatureMode): 'signatureModeNone' | 'signatureModeHmacSha256' {
  return SIGNATURE_MODE_LABEL_KEYS[mode];
}

/** The `Hooks` translation key for one delivery's status label — same "no dots in keys" reasoning as {@link hookSignatureModeLabelKey}. */
const DELIVERY_STATUS_LABEL_KEYS: Record<HookDeliveryStatus, 'deliveryStatusPending' | 'deliveryStatusReviewed' | 'deliveryStatusDiscarded'> = {
  pending: 'deliveryStatusPending',
  reviewed: 'deliveryStatusReviewed',
  discarded: 'deliveryStatusDiscarded',
};

export function hookDeliveryStatusLabelKey(
  status: HookDeliveryStatus,
): 'deliveryStatusPending' | 'deliveryStatusReviewed' | 'deliveryStatusDiscarded' {
  return DELIVERY_STATUS_LABEL_KEYS[status];
}
