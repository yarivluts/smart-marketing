import type { MetadataRoute } from 'next';
import messages from '@/messages/en.json';
import { PWA_BACKGROUND_COLOR, PWA_THEME_COLOR } from '@/lib/push/pwa';

/**
 * The installable-app manifest (served at /manifest.webmanifest and linked from every page).
 * One manifest for both languages: the app name is the brand, and `start_url` `/` sends the
 * person to their own language and last project.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: messages.Metadata.title,
    short_name: messages.Metadata.title,
    description: messages.Metadata.description,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    theme_color: PWA_THEME_COLOR,
    background_color: PWA_BACKGROUND_COLOR,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
