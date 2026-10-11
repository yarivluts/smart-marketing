import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { AdStudioStepper, type AdStudioStepNav } from './ad-studio-stepper';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const STEPS: AdStudioStepNav[] = [
  { id: 'brief', label: 'Brief', hint: 'What the ad is for', state: 'done', href: '?step=brief' },
  { id: 'plan', label: 'Plan', hint: 'Review and confirm', state: 'current', href: '?step=plan' },
  { id: 'create', label: 'Create', hint: 'Confirm the plan first', state: 'locked', href: '?step=create' },
  { id: 'review', label: 'Review & edit', hint: 'Nothing created yet', state: 'locked', href: '?step=review' },
  { id: 'publish', label: 'Publish', hint: 'Create the ads first', state: 'locked', href: '?step=publish' },
];

describe('AdStudioStepper', () => {
  it('links the reachable steps, marks the one being viewed, and locks the rest', () => {
    renderWithIntl(<AdStudioStepper steps={STEPS} active="plan" label="Ad creation steps" />);
    const nav = screen.getByRole('navigation', { name: 'Ad creation steps' });
    expect(within(nav).getAllByRole('link')).toHaveLength(2);
    expect(screen.getByTestId('ad-studio-step-plan').querySelector('a')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('ad-studio-step-brief').querySelector('a')).toHaveAttribute('href', '?step=brief');
    const create = screen.getByTestId('ad-studio-step-create');
    expect(create).toHaveAttribute('data-state', 'locked');
    expect(create.querySelector('a')).toBeNull();
    expect(create.querySelector('[aria-disabled="true"]')).toHaveAttribute('title', 'Confirm the plan first');
  });
});
