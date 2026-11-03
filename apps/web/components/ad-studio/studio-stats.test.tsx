import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { StudioStats } from './studio-stats';

const usageToday = { textGenerations: 0, videoSeconds: 0, images: 0 };
const limits = { text: 40, video: 120, images: 20 };

describe('StudioStats', () => {
  it('shows no figures or daily limits before the first ad exists', () => {
    renderWithIntl(<StudioStats overview={{ briefs: 0, scripted: 0, scriptedSeconds: 0 }} usageToday={usageToday} limits={limits} />);
    expect(screen.queryByTestId('ad-studio-stats')).toBeNull();
  });

  it('shows the figures and limits once there is an ad', () => {
    renderWithIntl(<StudioStats overview={{ briefs: 2, scripted: 1, scriptedSeconds: 30 }} usageToday={usageToday} limits={limits} />);
    expect(screen.getByTestId('ad-studio-stats')).toBeTruthy();
  });
});
