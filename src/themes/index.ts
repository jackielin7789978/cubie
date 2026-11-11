import { brandTheme } from './brand';
import { classicTheme } from './classic';
import { neonTheme } from './neon';
import type { Theme, ThemeId } from './types';

export type { Theme, ThemeId } from './types';

export const THEMES: Record<ThemeId, Theme> = { classic: classicTheme, brand: brandTheme, neon: neonTheme };
export const THEME_LIST: readonly Theme[] = [classicTheme, brandTheme, neonTheme];
export const DEFAULT_THEME_ID: ThemeId = 'classic';
