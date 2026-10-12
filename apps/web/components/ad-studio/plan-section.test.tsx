import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { PlanSection } from './plan-section';

describe('PlanSection', () => {
  it('starts folded with its title and state, and opens to show the tool', () => {
    render(
      <PlanSection title="Search keywords" state="12 keywords chosen" testId="section">
        <p>Keyword research</p>
      </PlanSection>,
    );
    const section = screen.getByTestId('section');
    expect(section).not.toHaveAttribute('open');
    expect(screen.getByText('12 keywords chosen')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Search keywords'));
    expect(section).toHaveAttribute('open');
  });
});
