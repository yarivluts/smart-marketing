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
          { id: 'i1', label: 'Idea 1 · Square', status: 'ready', format: 'square' },
          { id: 'i2', label: 'Idea 1 · Story', status: 'generating', format: 'story' },
        ]}
        scenes={[
          { id: 's1', number: 1, clip: { id: 'c1', status: 'ready' } },
          { id: 's2', number: 2, clip: null },
        ]}
      />,
      { locale: 'en' },
    );
    // The caption names the image, so the picture itself has empty alt text instead of repeating it.
    const first = screen.getAllByTestId('ad-studio-gallery-image')[0];
    expect(first).toHaveTextContent('Idea 1 · Square');
    expect(first.querySelector('img')).toHaveAttribute('src', '/m/images/i1/media');
    expect(first.querySelector('img')).toHaveAttribute('alt', '');
    expect(screen.getAllByTestId('ad-studio-gallery-image')[1]).toHaveTextContent('Being made');
    const scenes = screen.getAllByTestId('ad-studio-gallery-scene');
    expect(scenes[0].querySelector('video')).toHaveAttribute('src', '/m/clips/c1/media#t=0.1');
    expect(scenes[1]).toHaveTextContent('Scene 2 · Waiting');
    // Each tile has its image's own shape, a pending one too, so the gallery does not jump when it lands.
    const tiles = screen.getAllByTestId('ad-studio-gallery-image');
    expect(tiles[0].firstElementChild).toHaveClass('aspect-square');
    expect(tiles[1].firstElementChild).toHaveClass('aspect-[9/16]');
    expect(scenes[0].firstElementChild).toHaveClass('aspect-[9/16]');
  });

  it('shows a horizontal video as 16:9 clips', () => {
    renderWithIntl(<CreateGallery mediaBase="/m" images={[]} scenes={[{ id: 's1', number: 1, clip: null }]} videoFormat="horizontal" />, { locale: 'en' });
    expect(screen.getByTestId('ad-studio-gallery-scene').firstElementChild).toHaveClass('aspect-video');
  });

  it('renders nothing before anything is being made', () => {
    const { container } = renderWithIntl(<CreateGallery mediaBase="/m" images={[]} scenes={[]} />, { locale: 'en' });
    expect(container).toBeEmptyDOMElement();
  });
});
