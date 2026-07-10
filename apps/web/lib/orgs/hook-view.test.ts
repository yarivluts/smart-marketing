import { describe, expect, it } from 'vitest';
import { HOOK_DELIVERY_STATUSES, HOOK_SIGNATURE_MODES } from '@growthos/firebase-orm-models';
import { hookDeliveryStatusLabelKey, hookSignatureModeLabelKey } from './hook-view';
import messages from '../../messages/en.json';

describe('hookSignatureModeLabelKey', () => {
  it('maps every signature mode to a real key in the Hooks translation namespace', () => {
    for (const mode of HOOK_SIGNATURE_MODES) {
      const key = hookSignatureModeLabelKey(mode);
      expect(messages.Hooks).toHaveProperty(key);
    }
  });
});

describe('hookDeliveryStatusLabelKey', () => {
  it('maps every delivery status to a real key in the Hooks translation namespace', () => {
    for (const status of HOOK_DELIVERY_STATUSES) {
      const key = hookDeliveryStatusLabelKey(status);
      expect(messages.Hooks).toHaveProperty(key);
    }
  });
});
