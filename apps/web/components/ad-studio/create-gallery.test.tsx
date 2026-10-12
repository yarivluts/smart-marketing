import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { CreateGallery } from './create-gallery';

describe('CreateGallery', () => {
  it('shows each image and scene clip as it is made, ready ones playable', () => {
    renderWithIntl(
      <CreateGallery
        mediaBase="/m"
        images={[
          { id: 'i1', label: 'Idea 1 · Square', status: 'ready' },
          { id: 'i2', label: 'Idea 1 · Story', status: 'generating' },
        ]}
        scenes={[
          { id: 's1', number: 1, clip: { id: 'c1', status: 'ready' } },
          { id: 's2', number: 2, clip: null },
        ]}
      />,
      { locale: 'en' },
    );
    expect(screen.getByRole('img', { name: 'Idea 1 · Square' })).toHaveAttribute('src', '/m/images/i1/media');
    expect(screen.getAllByTestId('ad-studio-gallery-image')[1]).toHaveTextContent('Being made');
    const scenes = screen.getAllByTestId('ad-studio-gallery-scene');
    expect(scenes[0].querySelector('video')).toHaveAttribute('src', '/m/clips/c1/media#t=0.1');
    expect(scenes[1]).toHaveTextContent('Scene 2 · Waiting');
  });

  it('renders nothing before anything is being made', () => {
    const { container } = renderWithIntl(<CreateGallery mediaBase="/m" images={[]} scenes={[]} />, { locale: 'en' });
    expect(container).toBeEmptyDOMElement();
  });
});
