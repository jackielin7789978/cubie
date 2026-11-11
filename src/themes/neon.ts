import type { Theme } from './types';

export const neonTheme: Theme = {
  id: 'neon',
  name: '賽博龐克',
  background: '#05060F',
  sceneBackground: '#05060F',
  bodyColor: '#0B0D1A',
  faceColors: { U: '#F5F7FF', D: '#FFE600', F: '#00FF85', B: '#00B3FF', R: '#FE00FE', L: '#FF8A00' },
  sticker: { roughness: 0.4, metalness: 0, emissiveIntensity: 0.68 },
  bloom: true,
  bloomStrength: 0.18,
  lighting: { environment: 0.1, key: 0.3, ambient: 0.2 },
  ui: 'dark',
};
