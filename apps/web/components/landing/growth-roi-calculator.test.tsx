import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { GrowthRoiCalculator } from './growth-roi-calculator';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
}));

describe('GrowthRoiCalculator Component', () => {
  it('renders sliders, presets, and dynamic impact projections', () => {
    renderWithIntl(<GrowthRoiCalculator />);

    expect(screen.getByTestId('growth-roi-calculator')).toBeInTheDocument();
    expect(screen.getByText(/Net ROI/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /B2B/i })).toBeInTheDocument();
  });

  it('switches preset parameters on preset click', () => {
    renderWithIntl(<GrowthRoiCalculator />);

    const ecomBtn = screen.getByRole('button', { name: /E-Commerce|אי-קומרס/i });
    fireEvent.click(ecomBtn);

    expect(screen.getByText(/\$75,000/)).toBeInTheDocument();
  });

  it('updates calculations when moving the ad spend slider', () => {
    renderWithIntl(<GrowthRoiCalculator />);

    const slider = screen.getByLabelText(/Monthly Paid Ad Spend|תקציב פרסום/i);
    fireEvent.change(slider, { target: { value: '80000' } });

    expect(screen.getByText(/\$80,000/)).toBeInTheDocument();
  });
});
