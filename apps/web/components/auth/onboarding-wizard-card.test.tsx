import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { OnboardingWizardCard } from './onboarding-wizard-card';

const mockPush = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe('OnboardingWizardCard Component', () => {
  it('renders Step 1: Workspace setup with name and vertical inputs', () => {
    renderWithIntl(<OnboardingWizardCard initialStep={1} />, { locale: 'en' });

    expect(screen.getByTestId('onboarding-wizard-container')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-step-1')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-workspace-name-input')).toHaveValue('My Growth Workspace');
    expect(screen.getByTestId('onboarding-workspace-vertical-input')).toHaveValue('SaaS & Software');
  });

  it('navigates from Step 1 to Step 2 to Step 3 to Step 4', () => {
    renderWithIntl(<OnboardingWizardCard initialStep={1} />, { locale: 'en' });

    // Step 1 -> Step 2
    const nextBtn = screen.getByTestId('onboarding-next-button');
    fireEvent.click(nextBtn);
    expect(screen.getByTestId('onboarding-step-2')).toBeInTheDocument();

    // Step 2 -> Step 3
    fireEvent.click(screen.getByTestId('onboarding-next-button'));
    expect(screen.getByTestId('onboarding-step-3')).toBeInTheDocument();

    // Step 3 -> Step 4
    fireEvent.click(screen.getByTestId('onboarding-next-button'));
    expect(screen.getByTestId('onboarding-step-4')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-finish-button')).toBeInTheDocument();
  });

  it('validates required workspace name in Step 1 before proceeding', () => {
    renderWithIntl(<OnboardingWizardCard initialStep={1} initialProjectName="" />, { locale: 'en' });

    const nameInput = screen.getByTestId('onboarding-workspace-name-input');
    fireEvent.change(nameInput, { target: { value: '' } });

    const nextBtn = screen.getByTestId('onboarding-next-button');
    fireEvent.click(nextBtn);

    expect(screen.getByText('Workspace name is required')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-step-1')).toBeInTheDocument();
  });

  it('calls onComplete when clicking Launch Growth Cockpit on step 4', async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    renderWithIntl(<OnboardingWizardCard initialStep={4} onComplete={onComplete} />, { locale: 'en' });

    const finishBtn = screen.getByTestId('onboarding-finish-button');
    fireEvent.click(finishBtn);

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          projectName: 'My Growth Workspace',
          vertical: 'SaaS & Software',
        }),
      );
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });
});
