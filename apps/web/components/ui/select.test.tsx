import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

describe('Select', () => {
  it('opens options on trigger click and selects value', async () => {
    const user = userEvent.setup();
    render(
      <Select defaultValue="meta">
        <SelectTrigger>
          <SelectValue placeholder="Choose platform" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="meta">Meta Ads</SelectItem>
          <SelectItem value="google">Google Ads</SelectItem>
          <SelectItem value="tiktok">TikTok Ads</SelectItem>
        </SelectContent>
      </Select>,
    );

    const combobox = screen.getByRole('combobox');
    expect(combobox).toHaveTextContent('Meta Ads');

    await user.click(combobox);

    const googleOption = screen.getByRole('option', { name: 'Google Ads' });
    expect(googleOption).toBeInTheDocument();

    await user.click(googleOption);

    expect(combobox).toHaveTextContent('Google Ads');
  });
});
