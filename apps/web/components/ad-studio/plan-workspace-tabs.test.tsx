import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { PlanWorkspaceTabs } from './plan-workspace-tabs';

describe('PlanWorkspaceTabs', () => {
  it('shows strategy first and switches cleanly to script and image ideas tabs', () => {
    renderWithIntl(
      <PlanWorkspaceTabs
        scriptCount={3}
        ideasCount={2}
        strategySlot={<div data-testid="slot-strategy">Strategy body</div>}
        scriptSlot={<div data-testid="slot-script">Script body</div>}
        ideasSlot={<div data-testid="slot-ideas">Ideas body</div>}
      />,
      { locale: 'en' },
    );

    expect(screen.getByTestId('slot-strategy')).toBeInTheDocument();
    expect(screen.queryByTestId('slot-script')).toBeNull();
    expect(screen.queryByTestId('slot-ideas')).toBeNull();

    fireEvent.click(screen.getByTestId('ad-studio-plan-tab-script'));
    expect(screen.getByTestId('slot-script')).toBeInTheDocument();
    expect(screen.queryByTestId('slot-strategy')).toBeNull();

    fireEvent.click(screen.getByTestId('ad-studio-plan-tab-ideas'));
    expect(screen.getByTestId('slot-ideas')).toBeInTheDocument();
    expect(screen.queryByTestId('slot-script')).toBeNull();
  });

  it('renders localized Hebrew tab labels with counts', () => {
    renderWithIntl(
      <PlanWorkspaceTabs
        scriptCount={4}
        ideasCount={5}
        strategySlot={<div>S</div>}
        scriptSlot={<div>Sc</div>}
        ideasSlot={<div>Id</div>}
      />,
      { locale: 'he' },
    );

    expect(screen.getByTestId('ad-studio-plan-tab-strategy')).toHaveTextContent('תוכנית ומחקר');
    expect(screen.getByTestId('ad-studio-plan-tab-script')).toHaveTextContent('תסריט (4)');
    expect(screen.getByTestId('ad-studio-plan-tab-ideas')).toHaveTextContent('רעיונות לתמונות (5)');
  });
});
