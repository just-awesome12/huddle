import type { MetadataRoute } from 'next';

/**
 * PWA manifest. Icons are the "Spectrum Ring" brand assets (see
 * docs handoff ICON.md); colors use the deep brand background
 * (#0b0814) so the install splash matches the icon.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Huddle',
    short_name: 'Huddle',
    description: 'Group-based idea sharing for events, activities, food, and places.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0814',
    theme_color: '#0b0814',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
