import type { Theme } from './types';

// 配色參考 Omnichat 色票：Indigo 600/300、Vivid Blue 500、Success 500，加官網深藍
export const brandTheme: Theme = {
  id: 'brand',
  name: 'Omnichat',
  background: 'linear-gradient(#EAECFF, #FFFFFF)',
  bodyColor: '#F4F6FB',
  faceColors: { U: '#E6EAF5', D: '#000052', F: '#4F46E5', B: '#10B981', R: '#73BEF5', L: '#A5B4FC' },
  sticker: { roughness: 0.25, metalness: 0, clearcoat: 1 },
  bloom: false,
  lighting: { environment: 0.35, key: 1.6, ambient: 1.1 },
  ui: 'light',
};
