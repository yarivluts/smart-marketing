import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { CreateGoalModal } from './create-goal-modal';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import enMessages from '../../messages/en.json';
import heMessages from '../../messages/he.json';

const PRESET_KEYS = ['presetMrrGrowth', 'presetLeadVolume', 'presetCacCeiling', 'presetConversionRate'] as const;
const PRESET_TEST_IDS = ['preset-mrr-btn', 'preset-leads-btn', 'preset-cac-btn', 'preset-cvr-btn'];

describe('CreateGoalModal presets', () => {
  it('shows ready-made goals in plain words, with the jargon explained', () => {
    renderWithIntl(<CreateGoalModal orgId="o" projectId="p" isOpen onClose={() => undefined} />);
    PRESET_KEYS.forEach((key, i) => {
      expect(screen.getByTestId(PRESET_TEST_IDS[i]).textContent).toBe(enMessages.Goals[key]);
    });
    expect(screen.getByText(/ready-made goal/i)).toBeTruthy();
    expect(enMessages.Goals.presetCacCeiling).toMatch(/Cost per customer/);
    expect(enMessages.Goals.presetLeadVolume).toMatch(/interested people/);
  });

  it('has a Hebrew label for every preset', () => {
    for (const key of PRESET_KEYS) {
      expect(heMessages.Goals[key]).toMatch(/[֐-׿]/);
    }
  });

  it('fills the goal name from the translations, not from English text in code', () => {
    renderWithIntl(<CreateGoalModal orgId="o" projectId="p" isOpen onClose={() => undefined} />);
    fireEvent.click(screen.getByTestId('preset-cac-btn'));
    expect((screen.getByDisplayValue(enMessages.Goals.presetNameCac) as HTMLInputElement).value).toBe(
      'Keep the cost per customer under $45',
    );
    for (const key of ['presetNameMrr', 'presetNameLeads', 'presetNameCac', 'presetNameCvr'] as const) {
      expect(heMessages.Goals[key]).toMatch(/[֐-׿]/);
    }
  });
});
