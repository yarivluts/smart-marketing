import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { AuthCard } from './auth-card';

describe('AuthCard Component', () => {
  it('renders auth card with title, subtitle, and child content', () => {
    renderWithIntl(
      <AuthCard title="Welcome back" subtitle="Sign in to your account">
        <div data-testid="test-form">Form Content</div>
      </AuthCard>,
      { locale: 'en' },
    );

    expect(screen.getByTestId('auth-card-container')).toBeInTheDocument();
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
    expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
    expect(screen.getByTestId('test-form')).toBeInTheDocument();
    expect(screen.getByText('GrowthOS')).toBeInTheDocument();
  });

  it('renders security badges and feature highlights in branding side', () => {
    renderWithIntl(
      <AuthCard title="Create Account">
        <div>Form Content</div>
      </AuthCard>,
      { locale: 'en' },
    );

    expect(screen.getByText('Autonomous AI Marketing')).toBeInTheDocument();
    expect(screen.getByText('256-bit SSL Encrypted')).toBeInTheDocument();
    expect(screen.getByText('SOC2 Compliant')).toBeInTheDocument();
  });
});
