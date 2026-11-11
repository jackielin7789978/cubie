import type { Theme } from './types';

export const classicTheme: Theme = {
  id: 'classic',
  name: '經典',
  background: 'radial-gradient(circle at 50% 40%, #FFFFFF, #D9DEE8)',
  bodyColor: '#111111',
  faceColors: { U: '#FFFFFF', D: '#FFD500', F: '#009E60', B: '#0051BA', R: '#C41E3A', L: '#FF5800' },
  sticker: { roughness: 0.25, metalness: 0, clearcoat: 1 },
  bloom: false,
  lighting: { environment: 0.35, key: 1.6, ambient: 1.1 },
  ui: 'light',
};
