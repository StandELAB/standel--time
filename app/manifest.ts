import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'StandEL Time',
    short_name: 'StandEL Time',
    description: 'Учет рабочего времени и объектов StandEL AB',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#12283f',
    theme_color: '#12283f',
    lang: 'ru',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
