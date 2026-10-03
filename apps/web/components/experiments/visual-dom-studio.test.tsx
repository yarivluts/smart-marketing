import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VisualDomStudio } from './visual-dom-studio';

describe('VisualDomStudio', () => {
  it('renders viewport switcher, AI DOM copilot, and simulated DOM canvas', () => {
    render(<VisualDomStudio isOpen={true} />);

    expect(screen.getByTestId('visual-dom-studio')).toBeDefined();
    expect(screen.getByText('Visual DOM Studio')).toBeDefined();
    expect(screen.getByText('AI DOM Copilot')).toBeDefined();
    expect(screen.getByText('Variant B (AI)')).toBeDefined();
    expect(screen.getAllByText(/Secure, Court-Admissible Signatures/).length).toBeGreaterThanOrEqual(1);
  });

  it('allows applying AI variant to live DOM preview', () => {
    render(<VisualDomStudio isOpen={true} />);

    const applyBtn = screen.getByRole('button', { name: /Apply AI Variant to DOM/i });
    fireEvent.click(applyBtn);

    expect(
      screen.getAllByText(/AI-Powered Digital Contracts Signed in 30 Seconds/).length
    ).toBeGreaterThanOrEqual(1);
  });

  it('allows switching tabs to visual styles and DOM code', () => {
    render(<VisualDomStudio isOpen={true} />);

    const stylesTab = screen.getByRole('button', { name: 'Visual Styles' });
    fireEvent.click(stylesTab);
    expect(screen.getByText(/Selected Element: <h1/)).toBeDefined();

    const codeTab = screen.getByRole('button', { name: 'DOM Code' });
    fireEvent.click(codeTab);
    expect(screen.getByText('Mutation Diff (JSON)')).toBeDefined();
  });
});
