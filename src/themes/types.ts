import type { FaceColor } from '../core/types';

export type ThemeId = 'classic' | 'brand' | 'neon';

export interface Theme {
  id: ThemeId;
  /** 顯示在 UI 上的名稱 */
  name: string;
  /** 畫面背景，CSS 寫法（可以是漸層） */
  background: string;
  /** bloom 需要不透明的畫布；有設定時把這個顏色直接畫進 3D 場景 */
  sceneBackground?: string;
  /** 方塊本體（貼紙之間的縫） */
  bodyColor: string;
  faceColors: Record<FaceColor, string>;
  sticker: {
    roughness: number;
    metalness: number;
    clearcoat?: number;
    /** 有值時貼紙自發光：底色設成黑色，顏色由 emissive 決定 */
    emissiveIntensity?: number;
  };
  /** 是否開啟光暈後製 */
  bloom: boolean;
  bloomStrength?: number;
  lighting: {
    /** 環境貼圖強度 */
    environment: number;
    /** 主光（平行光）強度 */
    key: number;
    /** 環境光強度 */
    ambient: number;
  };
  /** UI 玻璃浮層的色調：light 是半透明白底，dark 是深色半透明 */
  ui: 'light' | 'dark';
}
