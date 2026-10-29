import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('shared screen-reader labels (toast and dialog)', () => {
  it('exist in both languages and are not left in English in Hebrew', () => {
    expect(en.Ui).toEqual({
      close: 'Close',
      dismissNotification: 'Dismiss notification',
      notifications: 'Notifications',
    });
    expect(Object.keys(he.Ui).sort()).toEqual(Object.keys(en.Ui).sort());
    for (const value of Object.values(he.Ui)) {
      expect(value).toMatch(/[֐-׿]/);
    }
  });
});
